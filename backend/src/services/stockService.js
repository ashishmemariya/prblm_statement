import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import Warehouse from '../models/Warehouse.js';
import Location from '../models/Location.js';
import { createLedgerEntry } from './ledgerService.js';
import { MOVEMENT_TYPES } from '../models/StockLedger.js';

/**
 * Helper to ensure a default or specific location exists for a warehouse.
 */
const resolveLocation = async (warehouseId, locationId, session) => {
  const options = session ? { session } : {};

  if (locationId) {
    if (mongoose.Types.ObjectId.isValid(locationId)) {
      const loc = await Location.findById(locationId, null, options);
      if (loc) return loc;
    }
    // Also check if warehouse has embedded locations
    const wh = await Warehouse.findById(warehouseId, null, options);
    if (wh && wh.locations && wh.locations.length) {
      const embedded = wh.locations.find((l) => l._id.toString() === locationId.toString() || l.code === locationId);
      if (embedded) {
        let standalone = await Location.findOne({ warehouse: warehouseId, code: embedded.code }, null, options);
        if (!standalone) {
          standalone = await Location.create(
            [{ warehouse: warehouseId, name: embedded.name, code: embedded.code, type: embedded.type }],
            options,
          );
          standalone = standalone[0];
        }
        return standalone;
      }
    }
  }

  // Find or create a default location for this warehouse
  let defaultLoc = await Location.findOne({ warehouse: warehouseId }, null, options);
  if (!defaultLoc) {
    const wh = await Warehouse.findById(warehouseId, null, options);
    const locName = wh ? `${wh.name} Main Storage` : 'Default Storage';
    const locCode = wh ? `${wh.code}-MAIN` : 'MAIN';
    const created = await Location.create(
      [{ warehouse: warehouseId, name: locName, code: locCode, type: 'Storage' }],
      options,
    );
    defaultLoc = created[0];
  }
  return defaultLoc;
};

/**
 * Recalculate and update product totalStock and warehouseStock breakdown.
 */
export const recalculateProductStock = async (productId, session) => {
  const options = session ? { session } : {};
  const inventories = await Inventory.find({ product: productId }, null, options);

  let totalStock = 0;
  const warehouseStockMap = {};

  for (const inv of inventories) {
    totalStock += inv.quantity || 0;
    const wId = inv.warehouse.toString();
    warehouseStockMap[wId] = (warehouseStockMap[wId] || 0) + (inv.quantity || 0);
  }

  await Product.findByIdAndUpdate(
    productId,
    {
      totalStock,
      warehouseStock: warehouseStockMap,
    },
    options,
  );

  return { totalStock, warehouseStock: warehouseStockMap };
};

/**
 * Get current stock of a product at a specific location or warehouse.
 */
export const getStock = async (productId, locationId) => {
  const inv = await Inventory.findOne({ product: productId, location: locationId });
  return inv ? inv.quantity : 0;
};

/**
 * Get aggregated stock details for a product across all locations.
 */
export const getProductStock = async (productId) => {
  const inventories = await Inventory.find({ product: productId })
    .populate('warehouse', 'name code')
    .populate('location', 'name code type');
  const total = inventories.reduce((sum, i) => sum + i.quantity, 0);
  return { total, inventories };
};

/**
 * Get total stock for all products at a specific location.
 */
export const getLocationStock = async (locationId) => {
  return Inventory.find({ location: locationId }).populate('product', 'name sku uom');
};

/**
 * Get total stock for all products in a warehouse.
 */
export const getWarehouseStock = async (warehouseId) => {
  return Inventory.find({ warehouse: warehouseId }).populate('product', 'name sku uom');
};

/**
 * Increase stock (Receipt validation).
 * Atomically updates Inventory, recalculates Product stock, and creates a StockLedger entry.
 */
export const increaseStock = async ({
  productId,
  warehouseId,
  locationId,
  quantity,
  referenceType = 'Receipt',
  referenceId,
  documentCode,
  performedBy,
  notes = '',
  session,
}) => {
  const qty = Number(quantity);
  if (qty <= 0) {
    throw new Error('Quantity to increase must be greater than zero');
  }

  const loc = await resolveLocation(warehouseId, locationId, session);
  const options = session ? { session } : {};

  // Find or create Inventory record
  let inventory = await Inventory.findOne(
    { product: productId, location: loc._id },
    null,
    options,
  );

  const quantityBefore = inventory ? inventory.quantity : 0;
  const quantityAfter = quantityBefore + qty;

  if (inventory) {
    inventory.quantity = quantityAfter;
    inventory.warehouse = warehouseId;
    await inventory.save(options);
  } else {
    const created = await Inventory.create(
      [
        {
          product: productId,
          warehouse: warehouseId,
          location: loc._id,
          quantity: quantityAfter,
          reservedQuantity: 0,
        },
      ],
      options,
    );
    inventory = created[0];
  }

  // Recalculate product aggregate stock
  await recalculateProductStock(productId, session);

  // Create Ledger Entry
  await createLedgerEntry({
    product: productId,
    warehouse: warehouseId,
    location: loc._id,
    movementType: MOVEMENT_TYPES.RECEIPT,
    documentType: 'Receipt',
    documentCode,
    documentId: referenceId ? referenceId.toString() : documentCode,
    quantityBefore,
    quantityChange: qty,
    quantityAfter,
    referenceType,
    referenceId,
    performedBy,
    notes,
    session,
  });

  return { inventory, quantityBefore, quantityAfter, quantityChange: qty };
};

/**
 * Decrease stock (Delivery validation).
 * Validates sufficient stock, prevents negative physical quantity, updates Inventory, and creates StockLedger entry.
 */
export const decreaseStock = async ({
  productId,
  warehouseId,
  locationId,
  quantity,
  referenceType = 'Delivery',
  referenceId,
  documentCode,
  performedBy,
  notes = '',
  session,
}) => {
  const qty = Number(quantity);
  if (qty <= 0) {
    throw new Error('Quantity to decrease must be greater than zero');
  }

  const loc = await resolveLocation(warehouseId, locationId, session);
  const options = session ? { session } : {};

  let inventory = await Inventory.findOne(
    { product: productId, location: loc._id },
    null,
    options,
  );

  const quantityBefore = inventory ? inventory.quantity : 0;

  // Check sufficient stock
  if (quantityBefore < qty) {
    const error = new Error(`Insufficient stock for product. Available: ${quantityBefore}, Requested: ${qty}`);
    error.statusCode = 400;
    throw error;
  }

  const quantityAfter = quantityBefore - qty;
  inventory.quantity = quantityAfter;
  await inventory.save(options);

  // Recalculate product aggregate stock
  await recalculateProductStock(productId, session);

  // Create Ledger Entry
  await createLedgerEntry({
    product: productId,
    warehouse: warehouseId,
    location: loc._id,
    movementType: MOVEMENT_TYPES.DELIVERY,
    documentType: 'Delivery',
    documentCode,
    documentId: referenceId ? referenceId.toString() : documentCode,
    quantityBefore,
    quantityChange: -qty,
    quantityAfter,
    referenceType,
    referenceId,
    performedBy,
    notes,
    session,
  });

  return { inventory, quantityBefore, quantityAfter, quantityChange: -qty };
};

/**
 * Internal Transfer stock between two locations/warehouses.
 * Atomically decreases source, increases destination, and creates two linked Ledger entries (OUT and IN).
 */
export const transferStock = async ({
  productId,
  fromWarehouseId,
  fromLocationId,
  toWarehouseId,
  toLocationId,
  quantity,
  referenceType = 'Transfer',
  referenceId,
  documentCode,
  performedBy,
  notes = '',
  session,
}) => {
  const qty = Number(quantity);
  if (qty <= 0) {
    throw new Error('Transfer quantity must be greater than zero');
  }

  const srcLoc = await resolveLocation(fromWarehouseId, fromLocationId, session);
  const destLoc = await resolveLocation(toWarehouseId, toLocationId, session);
  const options = session ? { session } : {};

  // Check source inventory
  let srcInventory = await Inventory.findOne(
    { product: productId, location: srcLoc._id },
    null,
    options,
  );

  const srcQtyBefore = srcInventory ? srcInventory.quantity : 0;
  if (srcQtyBefore < qty) {
    const error = new Error(`Insufficient stock at source location. Available: ${srcQtyBefore}, Requested: ${qty}`);
    error.statusCode = 400;
    throw error;
  }

  // 1. Decrease source
  const srcQtyAfter = srcQtyBefore - qty;
  srcInventory.quantity = srcQtyAfter;
  await srcInventory.save(options);

  // 2. Increase destination
  let destInventory = await Inventory.findOne(
    { product: productId, location: destLoc._id },
    null,
    options,
  );
  const destQtyBefore = destInventory ? destInventory.quantity : 0;
  const destQtyAfter = destQtyBefore + qty;

  if (destInventory) {
    destInventory.quantity = destQtyAfter;
    destInventory.warehouse = toWarehouseId;
    await destInventory.save(options);
  } else {
    const created = await Inventory.create(
      [
        {
          product: productId,
          warehouse: toWarehouseId,
          location: destLoc._id,
          quantity: destQtyAfter,
          reservedQuantity: 0,
        },
      ],
      options,
    );
    destInventory = created[0];
  }

  // Recalculate product aggregate stock
  await recalculateProductStock(productId, session);

  // 3. Create TRANSFER_OUT ledger entry
  await createLedgerEntry({
    product: productId,
    warehouse: fromWarehouseId,
    location: srcLoc._id,
    movementType: MOVEMENT_TYPES.TRANSFER_OUT,
    documentType: 'Transfer',
    documentCode,
    documentId: referenceId ? referenceId.toString() : documentCode,
    quantityBefore: srcQtyBefore,
    quantityChange: -qty,
    quantityAfter: srcQtyAfter,
    referenceType,
    referenceId,
    performedBy,
    notes: notes ? `${notes} (Transfer OUT)` : 'Transfer OUT',
    session,
  });

  // 4. Create TRANSFER_IN ledger entry
  await createLedgerEntry({
    product: productId,
    warehouse: toWarehouseId,
    location: destLoc._id,
    movementType: MOVEMENT_TYPES.TRANSFER_IN,
    documentType: 'Transfer',
    documentCode,
    documentId: referenceId ? referenceId.toString() : documentCode,
    quantityBefore: destQtyBefore,
    quantityChange: qty,
    quantityAfter: destQtyAfter,
    referenceType,
    referenceId,
    performedBy,
    notes: notes ? `${notes} (Transfer IN)` : 'Transfer IN',
    session,
  });

  return {
    source: { quantityBefore: srcQtyBefore, quantityAfter: srcQtyAfter },
    destination: { quantityBefore: destQtyBefore, quantityAfter: destQtyAfter },
    quantity: qty,
  };
};

/**
 * Adjust stock based on physical count.
 * Calculates difference (counted - system) and sets inventory to countedQuantity.
 */
export const adjustStock = async ({
  productId,
  warehouseId,
  locationId,
  countedQuantity,
  systemQuantity,
  referenceType = 'Adjustment',
  referenceId,
  documentCode,
  performedBy,
  notes = '',
  session,
}) => {
  const counted = Number(countedQuantity);
  if (counted < 0) {
    throw new Error('Counted physical quantity cannot be negative');
  }

  const loc = await resolveLocation(warehouseId, locationId, session);
  const options = session ? { session } : {};

  let inventory = await Inventory.findOne(
    { product: productId, location: loc._id },
    null,
    options,
  );

  const quantityBefore = inventory ? inventory.quantity : (Number(systemQuantity) || 0);
  const quantityChange = counted - quantityBefore;
  const quantityAfter = counted;

  if (inventory) {
    inventory.quantity = quantityAfter;
    inventory.warehouse = warehouseId;
    await inventory.save(options);
  } else {
    const created = await Inventory.create(
      [
        {
          product: productId,
          warehouse: warehouseId,
          location: loc._id,
          quantity: quantityAfter,
          reservedQuantity: 0,
        },
      ],
      options,
    );
    inventory = created[0];
  }

  // Recalculate product aggregate stock
  await recalculateProductStock(productId, session);

  // Create Ledger Entry
  await createLedgerEntry({
    product: productId,
    warehouse: warehouseId,
    location: loc._id,
    movementType: MOVEMENT_TYPES.ADJUSTMENT,
    documentType: 'Adjustment',
    documentCode,
    documentId: referenceId ? referenceId.toString() : documentCode,
    quantityBefore,
    quantityChange,
    quantityAfter,
    referenceType,
    referenceId,
    performedBy,
    notes,
    session,
  });

  return { inventory, quantityBefore, quantityAfter, quantityChange };
};

export default {
  increaseStock,
  decreaseStock,
  transferStock,
  adjustStock,
  getStock,
  getProductStock,
  getLocationStock,
  getWarehouseStock,
  recalculateProductStock,
};

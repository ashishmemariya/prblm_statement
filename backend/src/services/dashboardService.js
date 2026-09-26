import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Warehouse from '../models/Warehouse.js';
import Receipt from '../models/Receipt.js';
import Delivery from '../models/Delivery.js';
import Transfer from '../models/Transfer.js';
import StockLedger from '../models/StockLedger.js';
import Inventory from '../models/Inventory.js';

export const getDashboardMetrics = async (filters = {}) => {
  const [
    products,
    categories,
    warehouses,
    receipts,
    deliveries,
    transfers,
    recentLedger,
  ] = await Promise.all([
    Product.find({ active: true }).populate('categoryId', 'name color').lean(),
    Category.find({ active: true }).lean(),
    Warehouse.find({ active: true }).lean(),
    Receipt.find().lean(),
    Delivery.find().lean(),
    Transfer.find().lean(),
    StockLedger.find()
      .populate('product', 'name sku uom')
      .populate('warehouse', 'name code')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  // Calculate KPIs
  const totalProducts = products.length;
  const inStockProducts = products.filter((p) => (p.totalStock || 0) > 0);
  const totalProductsInStock = inStockProducts.length;

  const lowStockItems = products.filter(
    (p) => (p.totalStock || 0) > 0 && (p.totalStock || 0) <= (p.minStock || 0),
  ).length;

  const outOfStockItems = products.filter((p) => (p.totalStock || 0) === 0).length;

  const pendingReceipts = receipts.filter(
    (r) => r.status !== 'Done' && r.status !== 'Canceled' && r.status !== 'DONE' && r.status !== 'CANCELED',
  ).length;

  const pendingDeliveries = deliveries.filter(
    (d) => d.status !== 'Done' && d.status !== 'Canceled' && d.status !== 'DONE' && d.status !== 'CANCELED',
  ).length;

  const pendingTransfers = transfers.filter(
    (t) => t.status !== 'Done' && t.status !== 'Canceled' && t.status !== 'DONE' && t.status !== 'CANCELED',
  ).length;

  const totalInventoryValue = Math.round(
    products.reduce((sum, p) => sum + (p.totalStock || 0) * (p.costPrice || 0), 0),
  );

  // 30-day Trend Data from Ledger
  const trendMap = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    trendMap[key] = { Inbound: 0, Outbound: 0 };
  }

  // Fetch all ledger movements within last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const monthMovements = await StockLedger.find({ createdAt: { $gte: thirtyDaysAgo } }).lean();

  monthMovements.forEach((entry) => {
    const d = new Date(entry.createdAt);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (trendMap[key]) {
      const change = entry.quantityChange || entry.qty || 0;
      if (change > 0) {
        trendMap[key].Inbound += change;
      } else if (change < 0) {
        trendMap[key].Outbound += Math.abs(change);
      }
    }
  });

  const trendData = Object.entries(trendMap).map(([date, vals]) => ({
    date,
    Inbound: vals.Inbound,
    Outbound: vals.Outbound,
  }));

  // Category Distribution
  const categoryDistribution = categories.map((cat) => {
    const catProds = products.filter(
      (p) => (p.categoryId?._id || p.categoryId)?.toString() === cat._id.toString() || (p.category?._id || p.category)?.toString() === cat._id.toString(),
    );
    const units = catProds.reduce((sum, p) => sum + (p.totalStock || 0), 0);
    const value = Math.round(catProds.reduce((sum, p) => sum + (p.totalStock || 0) * (p.costPrice || 0), 0));
    return {
      name: cat.name,
      color: cat.color || '#6366f1',
      units,
      value,
      productCount: catProds.length,
    };
  });

  // Warehouse Breakdown
  const warehouseBreakdown = warehouses.map((wh) => {
    const units = products.reduce((sum, p) => {
      const stock = p.warehouseStock ? (p.warehouseStock[wh._id.toString()] || p.warehouseStock.get?.(wh._id.toString()) || 0) : 0;
      return sum + Number(stock || 0);
    }, 0);
    const value = Math.round(
      products.reduce((sum, p) => {
        const stock = p.warehouseStock ? (p.warehouseStock[wh._id.toString()] || p.warehouseStock.get?.(wh._id.toString()) || 0) : 0;
        return sum + Number(stock || 0) * (p.costPrice || 0);
      }, 0),
    );
    return {
      id: wh._id.toString(),
      name: wh.name,
      code: wh.code,
      units,
      value,
    };
  });

  return {
    kpis: {
      totalProducts,
      totalProductsInStock,
      totalInventoryValue,
      lowStockItems,
      outOfStockItems,
      pendingReceipts,
      pendingDeliveries,
      pendingTransfers,
      scheduledTransfers: pendingTransfers,
    },
    trendData,
    recentActivity: recentLedger,
    categoryDistribution,
    warehouseBreakdown,
  };
};

export default {
  getDashboardMetrics,
};

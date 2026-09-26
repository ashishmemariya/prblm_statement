import axios from 'axios';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { mockDb } from '../services/mockDb';

// Custom in-browser adapter that handles all backend routes locally
const clientMockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  // Small simulated latency for realistic feeling
  await new Promise((res) => setTimeout(res, 60));

  const url = config.url || '';
  const method = (config.method || 'get').toLowerCase();
  const [path, queryString] = url.split('?');
  const searchParams = new URLSearchParams(queryString || '');
  const queryObj: Record<string, string> = {};
  searchParams.forEach((val, key) => {
    queryObj[key] = val;
  });

  let parsedBody: any = {};
  if (config.data) {
    parsedBody = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  }

  try {
    // --- AUTH ---
    if (path === '/auth/login' && method === 'post') {
      const result = mockDb.login(parsedBody.email, parsedBody.password);
      return {
        data: { success: true, data: result },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/auth/signup' && method === 'post') {
      const result = mockDb.signup(parsedBody.name, parsedBody.email);
      return {
        data: { success: true, data: result },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }

    if (path === '/auth/forgot-password' && method === 'post') {
      return {
        data: { success: true, message: 'Reset OTP has been sent to your email.' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/auth/reset-password' && method === 'post') {
      return {
        data: { success: true, message: 'Password has been reset successfully.' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/auth/profile' && method === 'put') {
      const updated = mockDb.updateProfile(parsedBody);
      return {
        data: { success: true, data: updated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/auth/change-password' && method === 'put') {
      return {
        data: { success: true, message: 'Password changed successfully.' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- DASHBOARD ---
    if (path === '/dashboard' && method === 'get') {
      const metrics = mockDb.getDashboardMetrics();
      return {
        data: { success: true, data: metrics },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- CATEGORIES ---
    if (path === '/products/categories' && method === 'get') {
      const categories = mockDb.getCategories();
      return {
        data: { success: true, data: categories },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- PRODUCTS ---
    if (path === '/products' && method === 'get') {
      const prods = mockDb.getProducts(queryObj);
      return {
        data: { success: true, data: prods },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path.startsWith('/products/') && method === 'get') {
      const id = path.replace('/products/', '');
      const prod = mockDb.getProduct(id);
      if (!prod) throw new Error('Product not found');
      return {
        data: { success: true, data: prod },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/products' && method === 'post') {
      const created = mockDb.createProduct(parsedBody);
      return {
        data: { success: true, data: created },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }

    if (path.startsWith('/products/') && method === 'put') {
      const id = path.replace('/products/', '');
      const updated = mockDb.updateProduct(id, parsedBody);
      return {
        data: { success: true, data: updated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path.startsWith('/products/') && method === 'delete') {
      const id = path.replace('/products/', '');
      mockDb.deleteProduct(id);
      return {
        data: { success: true, message: 'Product deleted' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- WAREHOUSES ---
    if (path === '/warehouses' && method === 'get') {
      const warehouses = mockDb.getWarehouses();
      return {
        data: { success: true, data: warehouses },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- RECEIPTS ---
    if (path === '/receipts' && method === 'get') {
      const receipts = mockDb.getReceipts(queryObj);
      return {
        data: { success: true, data: receipts },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/receipts' && method === 'post') {
      const created = mockDb.createReceipt(parsedBody);
      return {
        data: { success: true, data: created },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }

    if (path.match(/\/receipts\/[^/]+\/status/) && method === 'put') {
      const id = path.split('/')[2];
      const updated = mockDb.updateReceiptStatus(id, parsedBody.status);
      return {
        data: { success: true, data: updated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path.match(/\/receipts\/[^/]+\/validate/) && method === 'post') {
      const id = path.split('/')[2];
      const validated = mockDb.validateReceipt(id);
      return {
        data: { success: true, data: validated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- DELIVERIES ---
    if (path === '/deliveries' && method === 'get') {
      const deliveries = mockDb.getDeliveries(queryObj);
      return {
        data: { success: true, data: deliveries },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/deliveries' && method === 'post') {
      const created = mockDb.createDelivery(parsedBody);
      return {
        data: { success: true, data: created },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }

    if (path.match(/\/deliveries\/[^/]+\/status/) && method === 'put') {
      const id = path.split('/')[2];
      const updated = mockDb.updateDeliveryStatus(id, parsedBody.status);
      return {
        data: { success: true, data: updated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path.match(/\/deliveries\/[^/]+\/validate/) && method === 'post') {
      const id = path.split('/')[2];
      const validated = mockDb.validateDelivery(id);
      return {
        data: { success: true, data: validated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- TRANSFERS ---
    if (path === '/transfers' && method === 'get') {
      const transfers = mockDb.getTransfers(queryObj);
      return {
        data: { success: true, data: transfers },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/transfers' && method === 'post') {
      const created = mockDb.createTransfer(parsedBody);
      return {
        data: { success: true, data: created },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }

    if (path.match(/\/transfers\/[^/]+\/validate/) && method === 'post') {
      const id = path.split('/')[2];
      const validated = mockDb.validateTransfer(id);
      return {
        data: { success: true, data: validated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- ADJUSTMENTS ---
    if (path === '/adjustments' && method === 'get') {
      const adjustments = mockDb.getAdjustments(queryObj);
      return {
        data: { success: true, data: adjustments },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    if (path === '/adjustments' && method === 'post') {
      const created = mockDb.createAdjustment(parsedBody);
      return {
        data: { success: true, data: created },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      };
    }

    if (path.match(/\/adjustments\/[^/]+\/validate/) && method === 'post') {
      const id = path.split('/')[2];
      const validated = mockDb.validateAdjustment(id);
      return {
        data: { success: true, data: validated },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // --- HISTORY / LEDGER ---
    if (path === '/history' && method === 'get') {
      const history = mockDb.getHistory(queryObj);
      return {
        data: { success: true, data: history },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    // Fallback not found
    throw new Error(`Endpoint not found: [${method.toUpperCase()}] ${path}`);
  } catch (error: any) {
    const errorResponse = {
      message: error?.message || 'Internal Client Mock Error',
    };
    return Promise.reject({
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: errorResponse,
        headers: {},
        config,
      },
    });
  }
};

export const axiosClient = axios.create({
  baseURL: '', // Routed locally
  headers: {
    'Content-Type': 'application/json',
  },
  adapter: clientMockAdapter,
});

axiosClient.interceptors.request.use((config: any) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

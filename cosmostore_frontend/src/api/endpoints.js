import api from "./client";

// ---------------- Auth ----------------
export const authApi = {
  register: (payload) => api.post("/auth/register", payload),
  login: (payload) => api.post("/auth/login", payload),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  updateProfile: (payload) => api.put("/auth/profile", payload),
  changePassword: (payload) => api.put("/auth/change-password", payload),
  notifications: () => api.get("/auth/notifications"),
  markNotificationRead: (id) => api.put(`/auth/notifications/${id}/read`),
};

// ---------------- Catalog ----------------
export const catalogApi = {
  brands: () => api.get("/products/brands"),
  categories: () => api.get("/categories"),
  createCategory: (payload) => api.post("/categories", payload),
  deleteCategory: (id) => api.delete(`/categories/${id}`),

  products: (params) => api.get("/products", { params }),
  product: (id) => api.get(`/products/${id}`),
  createProduct: (payload) => api.post("/products", payload),
  updateProduct: (id, payload) => api.put(`/products/${id}`, payload),
  deleteProduct: (id) => api.delete(`/products/${id}`),
  uploadProductImage: (id, formData) =>
    api.post(`/products/${id}/image`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  deleteProductImage: (productId, imageId) => api.delete(`/products/${productId}/image/${imageId}`),
  addReview: (productId, payload) => api.post(`/products/${productId}/reviews`, payload),

  bulkUploadTemplate: () => api.get("/products/bulk-upload/template", { responseType: "blob" }),
  bulkUploadProducts: (formData) =>
    api.post("/products/bulk-upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  stores: () => api.get("/stores"),
  store: (id) => api.get(`/stores/${id}`),
  myStore: () => api.get("/stores/my-store"),
  createStore: (payload) => api.post("/stores", payload),
  updateStore: (id, payload) => api.put(`/stores/${id}`, payload),
  resubmitStore: () => api.post("/stores/my-store/resubmit"),
};

// ---------------- Cart ----------------
export const cartApi = {
  get: () => api.get("/cart"),
  add: (productId, quantity = 1) => api.post("/cart/add", { product_id: productId, quantity }),
  update: (itemId, quantity) => api.put(`/cart/update/${itemId}`, { quantity }),
  remove: (itemId) => api.delete(`/cart/remove/${itemId}`),
  clear: () => api.delete("/cart/clear"),
};

// ---------------- Orders ----------------
export const ordersApi = {
  checkout: (payload) => api.post("/orders/checkout", payload),
  myOrders: () => api.get("/orders"),
  get: (id) => api.get(`/orders/${id}`),
  cancel: (id) => api.put(`/orders/${id}/cancel`),
  vendorOrders: () => api.get("/orders/vendor/orders"),
};

// ---------------- Wishlist (saved items) ----------------
export const wishlistApi = {
  list: () => api.get("/wishlist"),
  add: (product_id) => api.post("/wishlist", { product_id }),
  remove: (product_id) => api.delete(`/wishlist/${product_id}`),
};

// ---------------- Payments (JazzCash, Easypaisa, Pakistani cards via Safepay) ----------------
export const paymentsApi = {
  config: () => api.get("/payments/config"),

  easypaisaInitiate: (payload) => api.post("/payments/easypaisa/initiate", payload),
  easypaisaVerify: (payload) => api.post("/payments/easypaisa/verify", payload),

  jazzcashInitiate: (payload) => api.post("/payments/jazzcash/initiate", payload),
  jazzcashVerify: (payload) => api.post("/payments/jazzcash/verify", payload),

  cardInitiate: (payload) => api.post("/payments/card/initiate", payload),
  cardConfirm: (payload) => api.post("/payments/card/confirm", payload),
  cardStatus: (ref) => api.get(`/payments/card/status/${ref}`),
  pricing: () => api.get("/payments/pricing"),
};

// ---------------- Admin ----------------
export const adminApi = {
  users: (role) => api.get("/admin/users", { params: role ? { role } : {} }),
  toggleUserActive: (id) => api.put(`/admin/users/${id}/toggle-active`),
  setWatchlist: (id, watchlisted) => api.put(`/admin/users/${id}/watchlist`, { watchlisted }),

  stores: (status) => api.get("/admin/stores", { params: status ? { status } : {} }),
  setStoreStatus: (id, status, reason) => api.put(`/admin/stores/${id}/status`, { status, reason }),

  products: () => api.get("/admin/products"),

  orders: (status) => api.get("/admin/orders", { params: status ? { status } : {} }),
  updateOrderStatus: (id, status) => api.put(`/admin/orders/${id}/status`, { status }),

  flaggedOrders: () => api.get("/admin/fraud/flagged-orders"),
  fraudDecision: (orderId, decision) => api.put(`/admin/fraud/orders/${orderId}/decision`, { decision }),
  modelMetrics: () => api.get("/admin/fraud/model-metrics"),
  fraudChecks: () => api.get("/admin/fraud/checks"),

  analyticsSummary: () => api.get("/admin/analytics/summary"),
  updateCategory: (id, payload) => api.put(`/admin/categories/${id}`, payload),
};

import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE,

  // IMPORTANT:
  // Allows Flask-Login session cookies to be sent
  // with API requests.
  withCredentials: true,

  headers: {
    "Content-Type": "application/json",
  },
});


// ==================================================
// RESPONSE ERROR INTERCEPTOR
// ==================================================

api.interceptors.response.use(
  (response) => response,

  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      "Something went wrong. Please try again.";

    // Preserve the original Axios error while adding
    // a clean message property.
    error.message = message;

    return Promise.reject(error);
  }
);


export default api;

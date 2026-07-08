const BASE_URL = "/api";

export const api = {
    getToken() {
        return localStorage.getItem("taskflow_token");
    },

    setToken(token) {
        localStorage.setItem("taskflow_token", token);
    },

    clearToken() {
        localStorage.removeItem("taskflow_token");
        localStorage.removeItem("taskflow_user");
    },

    getUser() {
        try {
            return JSON.parse(localStorage.getItem("taskflow_user"));
        } catch {
            return null;
        }
    },

    setUser(user) {
        localStorage.setItem("taskflow_user", JSON.stringify(user));
    },

    async request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        
        options.headers = options.headers || {};
        
        if (options.body && !(options.body instanceof FormData)) {
            options.headers["Content-Type"] = "application/json";
            if (typeof options.body === "object") {
                options.body = JSON.stringify(options.body);
            }
        }

        const token = this.getToken();
        if (token) {
            options.headers["Authorization"] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, options);
            
            if (response.ok && response.headers.get("Content-Type") === "application/pdf") {
                return await response.blob();
            }

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 && endpoint !== "/auth/login") {
                    this.clearToken();
                    window.dispatchEvent(new CustomEvent("auth-expired"));
                }
                throw new Error(data.message || "Erro na requisição.");
            }

            return data;
        } catch (error) {
            console.error(`Erro na requisição para ${endpoint}:`, error);
            throw error;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: "GET" });
    },

    post(endpoint, body) {
        return this.request(endpoint, { method: "POST", body });
    },

    put(endpoint, body) {
        return this.request(endpoint, { method: "PUT", body });
    },

    patch(endpoint, body) {
        return this.request(endpoint, { method: "PATCH", body });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: "DELETE" });
    }
};

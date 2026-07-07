// TaskFlow - Módulo de Integração com a API REST

const BASE_URL = "/api";

export const api = {
    // Retorna o token salvo no localStorage
    getToken() {
        return localStorage.getItem("taskflow_token");
    },

    // Salva o token
    setToken(token) {
        localStorage.setItem("taskflow_token", token);
    },

    // Remove o token
    clearToken() {
        localStorage.removeItem("taskflow_token");
        localStorage.removeItem("taskflow_user");
    },

    // Retorna os dados do usuário salvo localmente
    getUser() {
        try {
            return JSON.parse(localStorage.getItem("taskflow_user"));
        } catch {
            return null;
        }
    },

    // Salva os dados do usuário localmente
    setUser(user) {
        localStorage.setItem("taskflow_user", JSON.stringify(user));
    },

    // Método genérico para requisições
    async request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        
        // Inicializa os headers
        options.headers = options.headers || {};
        
        // Adiciona Content-Type padrão para JSON se for um envio
        if (options.body && !(options.body instanceof FormData)) {
            options.headers["Content-Type"] = "application/json";
            if (typeof options.body === "object") {
                options.body = JSON.stringify(options.body);
            }
        }

        // Adiciona Token JWT se estiver logado
        const token = this.getToken();
        if (token) {
            options.headers["Authorization"] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, options);
            
            // Tratamento especial para PDF (retorna Blob)
            if (response.ok && response.headers.get("Content-Type") === "application/pdf") {
                return await response.blob();
            }

            const data = await response.json();

            if (!response.ok) {
                // Se o token estiver expirado ou inválido (401), desloga o usuário
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

    // Atalhos para métodos HTTP
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

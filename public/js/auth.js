import { api } from "./api.js";
import { showToast } from "./app.js";

export const auth = {
    checkSession() {
        const token = api.getToken();
        const user = api.getUser();
        
        if (token && user) {
            this.applyUserProfile(user);
            return true;
        }
        return false;
    },

    async login(email, password) {
        try {
            const data = await api.post("/auth/login", { email, password });
            api.setToken(data.token);
            api.setUser(data.user);
            this.applyUserProfile(data.user);
            showToast("Login realizado com sucesso!", "success");
            return true;
        } catch (error) {
            showToast(error.message || "E-mail ou senha inválidos.", "danger");
            return false;
        }
    },

    async register(name, email, password, role) {
        try {
            await api.post("/auth/register", { name, email, password, role });
            showToast("Conta criada com sucesso! Faça login.", "success");
            return true;
        } catch (error) {
            showToast(error.message || "Erro ao realizar cadastro.", "danger");
            return false;
        }
    },

    logout() {
        api.clearToken();
        showToast("Sessão encerrada com sucesso.", "info");
    },

    applyUserProfile(user) {
        if (!user) return;

        document.getElementById("user-display-name").textContent = user.name;
        
        let roleLabel = "Colaborador";
        if (user.role === "admin") roleLabel = "Administrador";
        if (user.role === "manager") roleLabel = "Gerente";
        
        const roleBadge = document.getElementById("user-display-role");
        roleBadge.textContent = roleLabel;
        
        roleBadge.className = "badge";
        if (user.role === "admin") roleBadge.classList.add("badge-danger");
        else if (user.role === "manager") roleBadge.classList.add("badge-primary");
        else roleBadge.classList.add("badge-success");

        const adminElements = document.querySelectorAll(".admin-only");
        adminElements.forEach(el => {
            if (user.role === "admin") {
                el.style.display = "";
            } else {
                el.style.display = "none";
            }
        });

        const managerElements = document.querySelectorAll(".manager-only");
        managerElements.forEach(el => {
            if (user.role === "manager" || user.role === "admin") {
                el.style.display = "";
                el.removeAttribute("disabled");
            } else {
                el.style.display = "none";
                el.setAttribute("disabled", "true");
            }
        });
    }
};

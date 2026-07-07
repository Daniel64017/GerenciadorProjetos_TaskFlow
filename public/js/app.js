// TaskFlow - Orquestrador do Frontend (SPA)

import { api } from "./api.js";
import { auth } from "./auth.js";
import { dashboard } from "./dashboard.js";
import { projects } from "./projects.js";
import { tasks } from "./tasks.js";

// ==========================================
// FUNÇÕES AUXILIARES GLOBAIS
// ==========================================

export function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "fa-info-circle";
    if (type === "success") icon = "fa-circle-check";
    if (type === "warning") icon = "fa-triangle-exclamation";
    if (type === "danger") icon = "fa-circle-xmark";
    
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    // Auto-remove após 3 segundos com efeito fade out
    setTimeout(() => {
        toast.style.animation = "fadeIn 0.25s ease reverse forwards";
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}


// ==========================================
// ROTEAMENTO DE ABAS E TELAS
// ==========================================

function switchScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
}

async function switchTab(tabId) {
    // Muda a classe active na sidebar
    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.remove("active");
        if (link.dataset.tab === tabId) {
            link.classList.add("active");
        }
    });

    // Muda a classe active na aba de conteúdo
    document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.remove("active");
    });
    document.getElementById(tabId).classList.add("active");

    // Atualiza o título da barra superior
    const titles = {
        "dashboard-tab": "Dashboard",
        "projects-tab": "Projetos Ativos",
        "tasks-tab": "Quadro Kanban",
        "users-tab": "Gerenciamento de Usuários",
        "alerts-tab": "Central de Alertas (Simulação)"
    };
    document.getElementById("current-tab-title").textContent = titles[tabId] || "TaskFlow";

    // Executa recargas específicas ao entrar na aba
    if (tabId === "dashboard-tab") {
        await dashboard.init();
    } else if (tabId === "projects-tab") {
        await projects.init();
    } else if (tabId === "tasks-tab") {
        await tasks.init();
    } else if (tabId === "users-tab") {
        await loadUsersTab();
    } else if (tabId === "alerts-tab") {
        const alerts = await api.get("/alerts");
        dashboard.renderFullAlertsTab(alerts);
        dashboard.updateAlertsCount(alerts);
    }
}


// ==========================================
// GERENCIAMENTO DE USUÁRIOS (ADMIN ONLY)
// ==========================================

let adminUsersList = [];

async function loadUsersTab() {
    try {
        const users = await api.get("/users");
        adminUsersList = users;
        renderUsersTable(users);
    } catch (error) {
        showToast("Erro ao carregar usuários.", "danger");
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById("users-table-body");
    tbody.innerHTML = "";

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum usuário cadastrado.</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement("tr");
        const formattedDate = new Date(user.created_at).toLocaleDateString("pt-BR");
        
        let roleLabel = "Colaborador";
        let roleClass = "badge-success";
        if (user.role === "admin") { roleLabel = "Administrador"; roleClass = "badge-danger"; }
        if (user.role === "manager") { roleLabel = "Gerente"; roleClass = "badge-primary"; }

        tr.innerHTML = `
            <td><strong>${user.name}</strong></td>
            <td>${user.email}</td>
            <td><span class="badge ${roleClass}">${roleLabel}</span></td>
            <td>${formattedDate}</td>
            <td>
                <button class="btn btn-sm btn-secondary btn-edit-user" data-id="${user.id}"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn btn-sm btn-outline-danger btn-delete-user" data-id="${user.id}"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Vincula ações da tabela de usuários
    tbody.querySelectorAll(".btn-edit-user").forEach(btn => {
        btn.onclick = (e) => {
            const id = e.currentTarget.dataset.id;
            openEditUser(id);
        };
    });

    tbody.querySelectorAll(".btn-delete-user").forEach(btn => {
        btn.onclick = async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm("Tem certeza que deseja excluir este usuário permanentemente? Ele perderá acesso imediato.")) {
                try {
                    await api.delete(`/users/${id}`);
                    showToast("Usuário excluído com sucesso!", "success");
                    await loadUsersTab();
                } catch (err) {
                    showToast(err.message || "Erro ao excluir usuário.", "danger");
                }
            }
        };
    });
}

function openCreateUser() {
    document.getElementById("user-modal-title").textContent = "Criar Usuário";
    document.getElementById("user-modal-id").value = "";
    document.getElementById("user-form").reset();
    document.getElementById("user-modal-password").placeholder = "Defina a senha do usuário";
    document.getElementById("user-modal-password").setAttribute("required", "true");
    document.getElementById("user-pw-required-text").textContent = "Obrigatória";
    openModal("user-modal");
}

function openEditUser(id) {
    const user = adminUsersList.find(u => u.id == id);
    if (!user) return;

    document.getElementById("user-modal-title").textContent = "Editar Usuário";
    document.getElementById("user-modal-id").value = user.id;
    document.getElementById("user-modal-name").value = user.name;
    document.getElementById("user-modal-email").value = user.email;
    document.getElementById("user-modal-role").value = user.role;
    
    // Senha é opcional ao editar
    document.getElementById("user-modal-password").value = "";
    document.getElementById("user-modal-password").placeholder = "Deixe em branco para não alterar";
    document.getElementById("user-modal-password").removeAttribute("required");
    document.getElementById("user-pw-required-text").textContent = "Opcional";
    
    openModal("user-modal");
}


// ==========================================
// INICIALIZAÇÃO E EVENTOS DOM
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Escuta expiração de token
    window.addEventListener("auth-expired", () => {
        switchScreen("auth-screen");
    });

    // 2. Transições da tela de Login / Registro
    document.getElementById("go-to-register").onclick = (e) => {
        e.preventDefault();
        document.getElementById("login-form").classList.remove("active");
        document.getElementById("register-form").classList.add("active");
        document.querySelector("#auth-screen h2").textContent = "Crie sua conta";
        document.querySelector("#auth-screen p").textContent = "Acesso gratuito para demonstrar seus conhecimentos.";
    };

    document.getElementById("go-to-login").onclick = (e) => {
        e.preventDefault();
        document.getElementById("register-form").classList.remove("active");
        document.getElementById("login-form").classList.add("active");
        document.querySelector("#auth-screen h2").textContent = "Bem-vindo de volta!";
        document.querySelector("#auth-screen p").textContent = "Gerencie seus projetos e tarefas com eficiência.";
    };

    // 3. Submissão do Login
    document.getElementById("login-form").onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const pass = document.getElementById("login-password").value;
        
        const success = await auth.login(email, pass);
        if (success) {
            switchScreen("main-screen");
            await switchTab("dashboard-tab");
        }
    };

    // 4. Submissão do Registro
    document.getElementById("register-form").onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("register-name").value;
        const email = document.getElementById("register-email").value;
        const pass = document.getElementById("register-password").value;
        const role = document.getElementById("register-role").value;

        const success = await auth.register(name, email, pass, role);
        if (success) {
            // Volta para a tela de login
            document.getElementById("go-to-login").click();
            document.getElementById("login-email").value = email;
            document.getElementById("login-password").value = "";
        }
    };

    // 5. Botão Sair da Conta
    document.getElementById("logout-btn").onclick = () => {
        auth.logout();
        switchScreen("auth-screen");
    };

    // 6. Cliques no menu Sidebar
    document.querySelectorAll(".nav-link").forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const tabId = e.currentTarget.dataset.tab;
            switchTab(tabId);
        };
    });

    // 7. Varredura manual de alertas de e-mail
    document.getElementById("trigger-alerts-btn").onclick = async () => {
        await dashboard.triggerVerification();
    };

    // 8. Eventos de Fechamento de Modais
    document.querySelectorAll(".close-modal-btn, .cancel-modal-btn").forEach(btn => {
        btn.onclick = (e) => {
            const modal = e.currentTarget.closest(".modal");
            if (modal) modal.classList.remove("active");
        };
    });

    // Fechar ao clicar fora do conteúdo
    window.onclick = (e) => {
        if (e.target.classList.contains("modal")) {
            e.target.classList.remove("active");
        }
    };

    // ==========================================
    // ENVIO DE FORMULÁRIOS DE MODAIS
    // ==========================================

    // Envio do formulário de Projetos
    document.getElementById("project-form").onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById("project-modal-id").value;
        const name = document.getElementById("project-modal-name").value;
        const description = document.getElementById("project-modal-description").value;
        await projects.saveProject({ id, name, description });
    };

    // Botão de Novo Projeto na aba
    document.getElementById("new-project-btn").onclick = () => {
        projects.openCreateProject();
    };

    // Envio do formulário de Equipe (Membros)
    document.getElementById("add-member-form").onsubmit = async (e) => {
        e.preventDefault();
        const userId = document.getElementById("member-select").value;
        if (userId) {
            await projects.addMember(userId);
        }
    };

    // Filtro de Projetos na aba de tarefas (Kanban)
    document.getElementById("task-project-filter").onchange = (e) => {
        tasks.activeProjectId = e.target.value;
        tasks.updateActionButtonsState();
        tasks.loadTasks();
    };

    // Botão de Nova Tarefa na aba
    document.getElementById("new-task-btn").onclick = () => {
        tasks.openCreateTask();
    };

    // Botão de Relatório PDF na aba
    document.getElementById("project-report-btn").onclick = () => {
        tasks.downloadProjectReport();
    };

    // Envio do formulário de Tarefas
    document.getElementById("task-form").onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById("task-modal-id").value;
        const title = document.getElementById("task-modal-title-input").value;
        const description = document.getElementById("task-modal-description").value;
        const status = document.getElementById("task-modal-status").value;
        const due_date = document.getElementById("task-modal-due-date").value;
        const assigned_to = document.getElementById("task-modal-assignee").value;

        await tasks.saveTask({ id, title, description, status, due_date, assigned_to });
    };

    // Botão de Novo Usuário (Admin ONLY)
    document.getElementById("new-user-btn").onclick = () => {
        openCreateUser();
    };

    // Envio do formulário de Usuários (Admin ONLY)
    document.getElementById("user-form").onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById("user-modal-id").value;
        const name = document.getElementById("user-modal-name").value;
        const email = document.getElementById("user-modal-email").value;
        const role = document.getElementById("user-modal-role").value;
        const password = document.getElementById("user-modal-password").value;

        const payload = { name, email, role };
        if (password) payload.password = password;

        try {
            if (id) {
                await api.put(`/users/${id}`, payload);
                showToast("Usuário atualizado com sucesso!", "success");
            } else {
                await api.post("/users", payload);
                showToast("Usuário criado com sucesso!", "success");
            }
            closeModal("user-modal");
            await loadUsersTab();
        } catch (err) {
            showToast(err.message || "Erro ao salvar usuário.", "danger");
        }
    };


    // ==========================================
    // BOOTSTRAP INICIAL
    // ==========================================
    
    // Verifica se já está logado
    const isLogged = auth.checkSession();
    if (isLogged) {
        switchScreen("main-screen");
        switchTab("dashboard-tab");
    } else {
        switchScreen("auth-screen");
    }

});

// TaskFlow - Módulo de Projetos e Membros

import { api } from "./api.js";
import { showToast, openModal, closeModal } from "./app.js";

export const projects = {
    // Array local com todos os projetos carregados
    list: [],

    // Inicializa a aba de projetos
    async init() {
        await this.loadProjects();
        this.setupSearch();
    },

    // Carrega a lista de projetos da API e renderiza
    async loadProjects() {
        try {
            const data = await api.get("/projects");
            this.list = data;
            this.renderProjects(this.list);
        } catch (error) {
            showToast("Erro ao carregar lista de projetos.", "danger");
        }
    },

    // Renderiza os projetos na tela
    renderProjects(projectsToRender) {
        const container = document.getElementById("projects-grid-container");
        container.innerHTML = "";

        if (projectsToRender.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 12px; display: block; color: var(--text-muted);"></i>
                    Nenhum projeto encontrado.
                </div>
            `;
            return;
        }

        const currentUser = api.getUser();
        const isManager = currentUser && (currentUser.role === "manager" || currentUser.role === "admin");

        projectsToRender.forEach(project => {
            const card = document.createElement("div");
            card.className = "project-card";
            card.dataset.id = project.id;
            
            card.innerHTML = `
                <div class="project-card-header">
                    <h3>${project.name}</h3>
                    <span class="badge badge-primary">${project.task_count} tarefas</span>
                </div>
                <p class="project-card-desc">${project.description || "Sem descrição disponível."}</p>
                <div class="project-card-meta">
                    <div class="project-card-meta-item">
                        <i class="fa-solid fa-user-circle"></i> Criador: ${project.creator_name}
                    </div>
                    <div class="project-card-meta-item">
                        <i class="fa-solid fa-users"></i> Equipe: ${project.member_count}
                    </div>
                </div>
                <div class="project-card-actions">
                    <button class="btn btn-sm btn-secondary btn-members" data-id="${project.id}" data-name="${project.name}">
                        <i class="fa-solid fa-users-gear"></i> Equipe
                    </button>
                    ${isManager ? `
                        <button class="btn btn-sm btn-secondary btn-edit-project" data-id="${project.id}">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-delete-project" data-id="${project.id}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : ""}
                </div>
            `;
            container.appendChild(card);
        });

        this.bindEvents();
    },

    // Vincula cliques aos botões dos cards
    bindEvents() {
        // Botão de Equipe (Membros)
        document.querySelectorAll(".btn-members").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.dataset.id;
                const name = e.currentTarget.dataset.name;
                this.openMembersManagement(id, name);
            };
        });

        // Botão de Editar Projeto
        document.querySelectorAll(".btn-edit-project").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.dataset.id;
                await this.openEditProject(id);
            };
        });

        // Botão de Excluir Projeto
        document.querySelectorAll(".btn-delete-project").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm("Tem certeza que deseja excluir este projeto permanentemente? Todas as tarefas dele também serão apagadas.")) {
                    await this.deleteProject(id);
                }
            };
        });
    },

    // Configura a barra de buscas
    setupSearch() {
        const input = document.getElementById("project-search");
        input.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = this.list.filter(p => 
                p.name.toLowerCase().includes(query) || 
                (p.description && p.description.toLowerCase().includes(query))
            );
            this.renderProjects(filtered);
        };
    },

    // Abre o formulário para criação
    openCreateProject() {
        document.getElementById("project-modal-title").textContent = "Novo Projeto";
        document.getElementById("project-modal-id").value = "";
        document.getElementById("project-form").reset();
        openModal("project-modal");
    },

    // Abre o formulário para edição
    async openEditProject(id) {
        const project = this.list.find(p => p.id == id);
        if (!project) return;
        
        document.getElementById("project-modal-title").textContent = "Editar Projeto";
        document.getElementById("project-modal-id").value = project.id;
        document.getElementById("project-modal-name").value = project.name;
        document.getElementById("project-modal-description").value = project.description || "";
        openModal("project-modal");
    },

    // Salva ou atualiza um projeto
    async saveProject(formData) {
        const id = formData.id;
        const payload = {
            name: formData.name,
            description: formData.description
        };

        try {
            if (id) {
                // Editar
                await api.put(`/projects/${id}`, payload);
                showToast("Projeto atualizado com sucesso!", "success");
            } else {
                // Criar
                await api.post("/projects", payload);
                showToast("Projeto criado com sucesso!", "success");
            }
            closeModal("project-modal");
            await this.loadProjects();
        } catch (error) {
            showToast(error.message || "Erro ao salvar projeto.", "danger");
        }
    },

    // Exclui projeto do banco
    async deleteProject(id) {
        try {
            await api.delete(`/projects/${id}`);
            showToast("Projeto excluído com sucesso!", "success");
            await this.loadProjects();
        } catch (error) {
            showToast(error.message || "Erro ao excluir projeto.", "danger");
        }
    },

    // ==========================================
    // SEÇÃO DE GERENCIAMENTO DE MEMBROS (EQUIPE)
    // ==========================================

    activeProjectId: null,

    // Abre a gestão de equipe do projeto
    async openMembersManagement(projectId, projectName) {
        this.activeProjectId = projectId;
        document.getElementById("members-modal-project-name").textContent = projectName;
        
        // Limpa formulário
        document.getElementById("add-member-form").reset();
        
        await this.loadMembersList();
        openModal("members-modal");
    },

    // Carrega e renderiza a lista de membros e disponíveis no dropdown
    async loadMembersList() {
        try {
            const data = await api.get(`/projects/${this.activeProjectId}/members`);
            const members = data.members;
            const available = data.available_users;

            // Renderiza Dropdown de Usuários para Adicionar
            const select = document.getElementById("member-select");
            select.innerHTML = '<option value="">Selecione um usuário...</option>';
            available.forEach(user => {
                select.innerHTML += `<option value="${user.id}">${user.name} (${user.email})</option>`;
            });

            // Renderiza Lista de Participantes Atuais
            const ul = document.getElementById("project-members-list");
            ul.innerHTML = "";

            const currentUser = api.getUser();
            const isManager = currentUser && (currentUser.role === "manager" || currentUser.role === "admin");

            if (members.length === 0) {
                ul.innerHTML = '<li class="empty-state">Sem participantes adicionados.</li>';
                return;
            }

            members.forEach(member => {
                const li = document.createElement("li");
                
                let roleLabel = "Colaborador";
                if (member.role === "admin") roleLabel = "Admin";
                if (member.role === "manager") roleLabel = "Gerente";

                li.innerHTML = `
                    <div class="member-name-email">
                        <span><strong>${member.name}</strong> (${roleLabel})</span>
                        <span class="member-email">${member.email}</span>
                    </div>
                    ${isManager ? `
                        <button class="btn-card-action btn-remove-member" data-userid="${member.id}" title="Remover membro">
                            <i class="fa-solid fa-user-minus text-danger"></i>
                        </button>
                    ` : ""}
                `;
                ul.appendChild(li);
            });

            // Adiciona evento de remoção
            if (isManager) {
                ul.querySelectorAll(".btn-remove-member").forEach(btn => {
                    btn.onclick = async (e) => {
                        const userId = e.currentTarget.dataset.userid;
                        if (confirm("Remover este colaborador do projeto? Ele também será desvinculado de todas as tarefas desse projeto.")) {
                            await this.removeMember(userId);
                        }
                    };
                });
            }

        } catch (error) {
            showToast("Erro ao carregar equipe do projeto.", "danger");
        }
    },

    // Adiciona novo membro ao projeto
    async addMember(userId) {
        try {
            await api.post(`/projects/${this.activeProjectId}/members`, { user_id: userId });
            showToast("Colaborador adicionado à equipe!", "success");
            await this.loadMembersList();
            // Atualiza projetos para atualizar contagens
            await this.loadProjects();
        } catch (error) {
            showToast(error.message || "Erro ao adicionar membro.", "danger");
        }
    },

    // Remove membro do projeto
    async removeMember(userId) {
        try {
            await api.delete(`/projects/${this.activeProjectId}/members/${userId}`);
            showToast("Membro removido com sucesso.", "success");
            await this.loadMembersList();
            // Atualiza projetos para atualizar contagens
            await this.loadProjects();
        } catch (error) {
            showToast(error.message || "Erro ao remover membro.", "danger");
        }
    }
};

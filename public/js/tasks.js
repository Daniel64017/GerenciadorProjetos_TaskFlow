import { api } from "./api.js";
import { showToast, openModal, closeModal } from "./app.js";

export const tasks = {
    list: [],
    activeProjectId: null,

    async init() {
        await this.populateProjectFilter();
        this.setupDragAndDrop();
        this.clearBoard();
    },

    async populateProjectFilter() {
        try {
            const projects = await api.get("/projects");
            const select = document.getElementById("task-project-filter");
            const selectedVal = select.value;
            
            select.innerHTML = '<option value="">Selecione um projeto...</option>';
            projects.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
            });
            
            if (selectedVal && projects.find(p => p.id == selectedVal)) {
                select.value = selectedVal;
                this.activeProjectId = selectedVal;
            } else {
                this.activeProjectId = null;
            }

            this.updateActionButtonsState();
        } catch (error) {
            showToast("Erro ao carregar lista de projetos para filtro.", "danger");
        }
    },

    updateActionButtonsState() {
        const hasProject = !!this.activeProjectId;
        const currentUser = api.getUser();
        const isManager = currentUser && (currentUser.role === "manager" || currentUser.role === "admin");
        const newBtn = document.getElementById("new-task-btn");
        const reportBtn = document.getElementById("project-report-btn");
        
        if (hasProject) {
            if (isManager) {
                newBtn.removeAttribute("disabled");
            }
            reportBtn.removeAttribute("disabled");
        } else {
            newBtn.setAttribute("disabled", "true");
            reportBtn.setAttribute("disabled", "true");
        }
    },

    clearBoard() {
        document.getElementById("cards-todo").innerHTML = '<p class="empty-state">Selecione um projeto para visualizar.</p>';
        document.getElementById("cards-in_progress").innerHTML = '<p class="empty-state">Selecione um projeto para visualizar.</p>';
        document.getElementById("cards-done").innerHTML = '<p class="empty-state">Selecione um projeto para visualizar.</p>';
        
        document.getElementById("count-todo").textContent = "0";
        document.getElementById("count-progress").textContent = "0";
        document.getElementById("count-done").textContent = "0";
    },

    async loadTasks() {
        if (!this.activeProjectId) {
            this.clearBoard();
            return;
        }

        try {
            const data = await api.get(`/tasks?project_id=${this.activeProjectId}`);
            this.list = data;
            this.renderKanban();
        } catch (error) {
            showToast("Erro ao carregar tarefas do projeto.", "danger");
        }
    },

    renderKanban() {
        const columns = {
            todo: document.getElementById("cards-todo"),
            in_progress: document.getElementById("cards-in_progress"),
            done: document.getElementById("cards-done")
        };

        Object.values(columns).forEach(col => col.innerHTML = "");

        const counts = { todo: 0, in_progress: 0, done: 0 };
        const todayStr = new Date().toISOString().split("T")[0];

        const currentUser = api.getUser();
        const isManager = currentUser && (currentUser.role === "manager" || currentUser.role === "admin");

        this.list.forEach(task => {
            counts[task.status]++;
            
            const card = document.createElement("div");
            card.className = "task-card";
            card.setAttribute("draggable", "true");
            card.dataset.id = task.id;
            card.dataset.status = task.status;
            
            card.ondragstart = (e) => {
                e.dataTransfer.setData("text/plain", task.id);
                card.style.opacity = "0.5";
            };
            
            card.ondragend = () => {
                card.style.opacity = "1";
            };

            let dueDateHTML = "";
            if (task.due_date) {
                const parts = task.due_date.split("-");
                const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                
                let timeClass = "";
                let iconClass = "fa-calendar";
                
                if (task.status !== "done") {
                    if (task.due_date < todayStr) {
                        timeClass = "danger";
                        iconClass = "fa-calendar-xmark";
                    } else {
                        const dueTime = new Date(task.due_date).getTime();
                        const todayTime = new Date(todayStr).getTime();
                        const diffDays = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 3) {
                            timeClass = "warning";
                            iconClass = "fa-clock";
                        }
                    }
                }
                dueDateHTML = `
                    <div class="task-card-due ${timeClass}">
                        <i class="fa-solid ${iconClass}"></i> ${formattedDate}
                    </div>
                `;
            }

            const assigneeHTML = task.assigned_name 
                ? `<div class="task-card-assignee" title="${task.assigned_email}">
                    <i class="fa-solid fa-user-tag"></i> ${task.assigned_name.split(" ")[0]}
                   </div>`
                : `<div class="task-card-assignee text-muted" style="background:transparent; border: 1px dashed var(--border-color)">
                    <i class="fa-regular fa-user"></i> Ninguém
                   </div>`;

            let statusActionHTML = "";
            const isAssignedToMe = currentUser && task.assigned_to === currentUser.id;
            const canChangeStatus = isManager || isAssignedToMe;

            if (canChangeStatus) {
                if (task.status === "todo") {
                    statusActionHTML = `<button class="btn-card-action btn-status-next" data-id="${task.id}" data-next="in_progress" title="Mover para Em Andamento"><i class="fa-solid fa-arrow-right"></i></button>`;
                } else if (task.status === "in_progress") {
                    statusActionHTML = `
                        <button class="btn-card-action btn-status-next" data-id="${task.id}" data-next="todo" title="Voltar para A Fazer"><i class="fa-solid fa-arrow-left"></i></button>
                        <button class="btn-card-action btn-status-next" data-id="${task.id}" data-next="done" title="Mover para Concluída"><i class="fa-solid fa-check"></i></button>
                    `;
                } else if (task.status === "done") {
                    statusActionHTML = `<button class="btn-card-action btn-status-next" data-id="${task.id}" data-next="in_progress" title="Mover de volta para Em Andamento"><i class="fa-solid fa-arrow-left"></i></button>`;
                }
            }

            card.innerHTML = `
                <div class="task-card-header">
                    <h4>${task.title}</h4>
                </div>
                <p class="task-card-desc">${task.description || "Sem descrição."}</p>
                <div class="task-card-meta">
                    ${dueDateHTML}
                    ${assigneeHTML}
                </div>
                <div class="task-card-actions">
                    ${statusActionHTML}
                    ${isManager ? `
                        <button class="btn-card-action btn-edit-task" data-id="${task.id}" title="Editar Tarefa"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-card-action btn-delete-task text-danger" data-id="${task.id}" title="Excluir Tarefa"><i class="fa-solid fa-trash"></i></button>
                    ` : ""}
                </div>
            `;
            columns[task.status].appendChild(card);
        });

        document.getElementById("count-todo").textContent = counts.todo;
        document.getElementById("count-progress").textContent = counts.in_progress;
        document.getElementById("count-done").textContent = counts.done;

        Object.keys(columns).forEach(status => {
            if (columns[status].children.length === 0) {
                columns[status].innerHTML = '<p class="empty-state">Sem tarefas nesta etapa.</p>';
            }
        });

        this.bindEvents();
    },

    bindEvents() {
        document.querySelectorAll(".btn-status-next").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.dataset.id;
                const nextStatus = e.currentTarget.dataset.next;
                await this.updateTaskStatus(id, nextStatus);
            };
        });

        document.querySelectorAll(".btn-edit-task").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.dataset.id;
                await this.openEditTask(id);
            };
        });

        document.querySelectorAll(".btn-delete-task").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
                    await this.deleteTask(id);
                }
            };
        });
    },

    setupDragAndDrop() {
        const columns = document.querySelectorAll(".kanban-column");
        
        columns.forEach(col => {
            col.ondragover = (e) => {
                e.preventDefault();
                col.style.backgroundColor = "#121a2f";
            };

            col.ondragleave = () => {
                col.style.backgroundColor = "";
            };

            col.ondrop = async (e) => {
                e.preventDefault();
                col.style.backgroundColor = "";
                const id = e.dataTransfer.getData("text/plain");
                const newStatus = col.dataset.status;
                
                const task = this.list.find(t => t.id == id);
                if (task && task.status !== newStatus) {
                    await this.updateTaskStatus(id, newStatus);
                }
            };
        });
    },

    async updateTaskStatus(id, status) {
        try {
            await api.patch(`/tasks/${id}/status`, { status });
            showToast("Status da tarefa atualizado!", "success");
            await this.loadTasks();
        } catch (error) {
            showToast(error.message || "Você não tem permissão para alterar o status desta tarefa.", "danger");
            await this.loadTasks();
        }
    },

    async openCreateTask() {
        if (!this.activeProjectId) return;
        
        document.getElementById("task-modal-title").textContent = "Nova Tarefa";
        document.getElementById("task-modal-id").value = "";
        document.getElementById("task-form").reset();
        document.getElementById("task-modal-status").value = "todo";
        
        await this.loadAssigneesDropdown();
        openModal("task-modal");
    },

    async openEditTask(id) {
        const task = this.list.find(t => t.id == id);
        if (!task) return;
        
        document.getElementById("task-modal-title").textContent = "Editar Tarefa";
        document.getElementById("task-modal-id").value = task.id;
        document.getElementById("task-modal-title-input").value = task.title;
        document.getElementById("task-modal-description").value = task.description || "";
        document.getElementById("task-modal-status").value = task.status;
        document.getElementById("task-modal-due-date").value = task.due_date || "";
        
        await this.loadAssigneesDropdown(task.assigned_to);
        openModal("task-modal");
    },

    async loadAssigneesDropdown(selectedAssigneeId = null) {
        try {
            const data = await api.get(`/projects/${this.activeProjectId}/members`);
            const select = document.getElementById("task-modal-assignee");
            
            select.innerHTML = '<option value="">Sem responsável definido</option>';
            data.members.forEach(member => {
                let roleLabel = member.role === "admin" ? "Admin" : member.role === "manager" ? "Gerente" : "Colaborador";
                select.innerHTML += `<option value="${member.id}">${member.name} (${roleLabel})</option>`;
            });
            
            if (selectedAssigneeId) {
                select.value = selectedAssigneeId;
            }
        } catch (error) {
            showToast("Erro ao carregar lista de colaboradores para atribuição.", "danger");
        }
    },

    async saveTask(formData) {
        const id = formData.id;
        const payload = {
            title: formData.title,
            description: formData.description,
            status: formData.status,
            project_id: this.activeProjectId,
            assigned_to: formData.assigned_to || null,
            due_date: formData.due_date || null
        };

        try {
            if (id) {
                await api.put(`/tasks/${id}`, payload);
                showToast("Tarefa atualizada com sucesso!", "success");
            } else {
                await api.post("/tasks", payload);
                showToast("Tarefa criada com sucesso!", "success");
            }
            closeModal("task-modal");
            await this.loadTasks();
        } catch (error) {
            showToast(error.message || "Erro ao salvar tarefa.", "danger");
        }
    },

    async deleteTask(id) {
        try {
            await api.delete(`/tasks/${id}`);
            showToast("Tarefa excluída com sucesso!", "success");
            await this.loadTasks();
        } catch (error) {
            showToast(error.message || "Erro ao excluir tarefa.", "danger");
        }
    },

    async downloadProjectReport() {
        if (!this.activeProjectId) return;
        
        try {
            showToast("Gerando relatório em PDF...", "info");
            const blob = await api.get(`/reports/project/${this.activeProjectId}`);
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `relatorio_projeto_${this.activeProjectId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            showToast("Relatório baixado com sucesso!", "success");
        } catch (error) {
            showToast("Erro ao gerar relatório do projeto.", "danger");
        }
    }
};

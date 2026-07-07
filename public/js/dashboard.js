// TaskFlow - Módulo do Dashboard e Gráficos

import { api } from "./api.js";
import { showToast } from "./app.js";

let statusChartInstance = null;

export const dashboard = {
    // Inicializa ou atualiza o Dashboard
    async init() {
        try {
            const projects = await api.get("/projects");
            const tasks = await api.get("/tasks");
            const alerts = await api.get("/alerts");
            
            this.updateStatsCards(projects, tasks);
            this.renderStatusChart(tasks);
            this.renderRecentAlerts(alerts);
            this.renderFullAlertsTab(alerts);
            this.updateAlertsCount(alerts);
        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
            showToast("Erro ao atualizar dados do dashboard.", "danger");
        }
    },

    // Atualiza os contadores numéricos
    updateStatsCards(projects, tasks) {
        document.getElementById("stat-projects-count").textContent = projects.length;
        
        const todoCount = tasks.filter(t => t.status === "todo" || t.status === "in_progress").length;
        const doneCount = tasks.filter(t => t.status === "done").length;
        
        // Identifica tarefas atrasadas (status != done e due_date < hoje)
        const todayStr = new Date().toISOString().split("T")[0];
        const overdueCount = tasks.filter(t => t.status !== "done" && t.due_date && t.due_date < todayStr).length;
        
        document.getElementById("stat-tasks-todo").textContent = todoCount;
        document.getElementById("stat-tasks-done").textContent = doneCount;
        document.getElementById("stat-tasks-overdue").textContent = overdueCount;
    },

    // Renderiza o gráfico Chart.js
    renderStatusChart(tasks) {
        const ctx = document.getElementById("tasks-status-chart").getContext("2d");
        
        const todo = tasks.filter(t => t.status === "todo").length;
        const inProgress = tasks.filter(t => t.status === "in_progress").length;
        const done = tasks.filter(t => t.status === "done").length;
        
        // Se não houver tarefas, exibe dados vazios padrão para o gráfico não quebrar
        const total = todo + inProgress + done;
        const chartData = total > 0 ? [todo, inProgress, done] : [1, 0, 0];
        const chartLabels = total > 0 ? ["A Fazer", "Em Andamento", "Concluída"] : ["Nenhuma tarefa registrada"];
        const chartColors = total > 0 ? ["#3b82f6", "#f59e0b", "#10b981"] : ["#334155"];
        
        // Destrói gráfico antigo se existir
        if (statusChartInstance) {
            statusChartInstance.destroy();
        }

        statusChartInstance = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    backgroundColor: chartColors,
                    borderWidth: 1,
                    borderColor: "#151d30"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: "#94a3b8",
                            font: { family: "Outfit" }
                        }
                    }
                },
                cutout: "70%"
            }
        });
    },

    // Atualiza a badge de alertas não lidos no menu
    updateAlertsCount(alerts) {
        const badge = document.getElementById("alerts-unread-badge");
        badge.textContent = alerts.length;
        if (alerts.length > 0) {
            badge.style.display = "inline-block";
        } else {
            badge.style.display = "none";
        }
    },

    // Renderiza uma prévia dos alertas recentes no Dashboard
    renderRecentAlerts(alerts) {
        const container = document.getElementById("dashboard-alerts-container");
        container.innerHTML = "";
        
        if (alerts.length === 0) {
            container.innerHTML = '<p class="empty-state">Nenhum alerta enviado.</p>';
            return;
        }

        // Mostra os 3 últimos
        const recent = alerts.slice(0, 3);
        recent.forEach(alert => {
            const card = document.createElement("div");
            card.className = "alert-message-card";
            
            // Determina a borda baseada no assunto do e-mail
            if (alert.subject.includes("URGENTE")) {
                card.classList.add("overdue-alert");
            } else {
                card.classList.add("due-alert");
            }

            const formattedDate = new Date(alert.sent_at).toLocaleString("pt-BR");
            
            card.innerHTML = `
                <div class="alert-message-header">
                    <span class="alert-message-title">${alert.subject}</span>
                    <span class="alert-message-meta">${formattedDate}</span>
                </div>
                <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">Para: ${alert.to_email}</div>
            `;
            container.appendChild(card);
        });
    },

    // Renderiza todos os alertas na aba dedicada a Alertas
    renderFullAlertsTab(alerts) {
        const container = document.getElementById("alerts-history-container");
        container.innerHTML = "";
        
        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-envelope-open-text" style="font-size: 3rem; margin-bottom: 12px; display: block; color: var(--text-muted);"></i>
                    Nenhum e-mail de alerta disparado ou registrado no sistema até o momento.
                </div>
            `;
            return;
        }

        alerts.forEach(alert => {
            const card = document.createElement("div");
            card.className = "alert-message-card";
            
            if (alert.subject.includes("URGENTE")) {
                card.classList.add("overdue-alert");
            } else {
                card.classList.add("due-alert");
            }

            const formattedDate = new Date(alert.sent_at).toLocaleString("pt-BR");
            
            card.innerHTML = `
                <div class="alert-message-header">
                    <div class="alert-message-title">${alert.subject}</div>
                    <div class="alert-message-meta">${formattedDate}</div>
                </div>
                <div style="font-size: 0.85rem; font-weight: 500; color: var(--color-primary); margin-bottom: 10px;">
                    <i class="fa-solid fa-paper-plane"></i> Destinatário: ${alert.to_email}
                </div>
                <div class="alert-message-body">${alert.body}</div>
            `;
            container.appendChild(card);
        });
    },

    // Dispara a varredura manual de tarefas para geração de alertas
    async triggerVerification() {
        try {
            showToast("Verificando prazos de entrega...", "info");
            const result = await api.post("/alerts/check");
            showToast(`${result.message} Alertas gerados: ${result.alerts_generated}`, "success");
            // Recarrega os dados do Dashboard
            await this.init();
        } catch (error) {
            showToast("Erro ao processar varredura de prazos.", "danger");
        }
    }
};

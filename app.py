import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import datetime
import jwt
import bcrypt
from flask import Flask, request, jsonify, send_from_directory, make_response
from functools import wraps
from fpdf import FPDF

from config import Config
from db import get_db_connection, init_db

# Inicializa o Flask
app = Flask(__name__, static_folder="public", static_url_path="")

# Configuração do segredo JWT
app.config["SECRET_KEY"] = Config.SECRET_KEY

# Inicializa o banco de dados se necessário ao subir o app
with app.app_context():
    init_db()


# ==========================================
# MIDDLEWARES / DECORATORS
# ==========================================

def token_required(f):
    """Decorator para exigir autenticação via JWT no header Authorization."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get("Authorization")
        
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            
        if not token:
            return jsonify({"message": "Token de autenticação ausente!"}), 401
            
        try:
            data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            # Busca o usuário no banco para garantir que ainda existe e obter dados atuais
            conn = get_db_connection()
            user = conn.execute("SELECT id, name, email, role FROM users WHERE id = ?", (data["sub"],)).fetchone()
            conn.close()
            
            if not user:
                return jsonify({"message": "Usuário inválido ou inexistente!"}), 401
                
            current_user = dict(user)
        except jwt.ExpiredSignatureError:
            return jsonify({"message": "Token expirado! Faça login novamente."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"message": "Token inválido!"}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated


def roles_allowed(*roles):
    """Decorator para restringir acesso a perfis específicos."""
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user["role"] not in roles:
                return jsonify({"message": "Acesso negado: Perfil sem permissão para esta ação!"}), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator


# ==========================================
# ROTAS ESTÁTICAS (FRONTEND)
# ==========================================

@app.route("/")
def serve_index():
    return send_from_directory("public", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("public", path)


# ==========================================
# ROTAS DE AUTENTICAÇÃO
# ==========================================

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data or not data.get("name") or not data.get("email") or not data.get("password"):
        return jsonify({"message": "Todos os campos (nome, e-mail e senha) são obrigatórios!"}), 400
        
    name = data.get("name")
    email = data.get("email").lower().strip()
    password = data.get("password")
    # Por padrão, cadastro comum cria perfil 'user'
    role = data.get("role", "user")
    
    if role not in ["admin", "manager", "user"]:
        return jsonify({"message": "Perfil de usuário inválido!"}), 400
        
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (name, email, password_hash, role)
        )
        conn.commit()
        return jsonify({"message": "Usuário cadastrado com sucesso!"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"message": "Este e-mail já está cadastrado!"}), 400
    except Exception as e:
        return jsonify({"message": f"Erro ao registrar: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or not data.get("email") or not data.get("password"):
        return jsonify({"message": "E-mail e senha são obrigatórios!"}), 400
        
    email = data.get("email").lower().strip()
    password = data.get("password")
    
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify({"message": "E-mail ou senha incorretos!"}), 401
        
    # Gera o Token JWT válido por 24 horas
    expiration = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
    token = jwt.encode(
        {
            "sub": user["id"],
            "role": user["role"],
            "exp": expiration
        },
        app.config["SECRET_KEY"],
        algorithm="HS256"
    )
    
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"]
        }
    })


@app.route("/api/auth/me", methods=["GET"])
@token_required
def get_me(current_user):
    return jsonify(current_user)


# ==========================================
# ROTAS DE USUÁRIOS (GERENCIAMENTO - ADMIN ONLY)
# ==========================================

@app.route("/api/users", methods=["GET"])
@token_required
@roles_allowed("admin")
def list_users(current_user):
    conn = get_db_connection()
    users = conn.execute("SELECT id, name, email, role, created_at FROM users").fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])


@app.route("/api/users", methods=["POST"])
@token_required
@roles_allowed("admin")
def admin_create_user(current_user):
    data = request.get_json()
    if not data or not data.get("name") or not data.get("email") or not data.get("password") or not data.get("role"):
        return jsonify({"message": "Preencha todos os campos obrigatórios!"}), 400
        
    name = data.get("name")
    email = data.get("email").lower().strip()
    password = data.get("password")
    role = data.get("role")
    
    if role not in ["admin", "manager", "user"]:
        return jsonify({"message": "Perfil inválido!"}), 400
        
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            (name, email, password_hash, role)
        )
        conn.commit()
        return jsonify({"message": "Usuário criado com sucesso!"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"message": "E-mail já cadastrado!"}), 400
    finally:
        conn.close()


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@token_required
@roles_allowed("admin")
def admin_update_user(current_user, user_id):
    data = request.get_json()
    if not data or not data.get("name") or not data.get("email") or not data.get("role"):
        return jsonify({"message": "Nome, e-mail e perfil são obrigatórios!"}), 400
        
    name = data.get("name")
    email = data.get("email").lower().strip()
    role = data.get("role")
    password = data.get("password")  # Opcional na edição
    
    if role not in ["admin", "manager", "user"]:
        return jsonify({"message": "Perfil inválido!"}), 400
        
    conn = get_db_connection()
    try:
        if password:
            password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            conn.execute(
                "UPDATE users SET name = ?, email = ?, role = ?, password_hash = ? WHERE id = ?",
                (name, email, role, password_hash, user_id)
            )
        else:
            conn.execute(
                "UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?",
                (name, email, role, user_id)
            )
        conn.commit()
        return jsonify({"message": "Usuário atualizado com sucesso!"})
    except sqlite3.IntegrityError:
        return jsonify({"message": "E-mail já está em uso por outro usuário!"}), 400
    finally:
        conn.close()


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@token_required
@roles_allowed("admin")
def admin_delete_user(current_user, user_id):
    if current_user["id"] == user_id:
        return jsonify({"message": "Você não pode excluir sua própria conta!"}), 400
        
    conn = get_db_connection()
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Usuário excluído com sucesso!"})


# ==========================================
# ROTAS DE PROJETOS
# ==========================================

@app.route("/api/projects", methods=["GET"])
@token_required
def list_projects(current_user):
    conn = get_db_connection()
    # Admins e Gerentes podem ver todos os projetos
    if current_user["role"] in ["admin", "manager"]:
        projects = conn.execute(
            """
            SELECT p.*, u.name as creator_name,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
            (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
            FROM projects p
            JOIN users u ON p.created_by = u.id
            ORDER BY p.created_at DESC
            """
        ).fetchall()
    else:
        # Usuários normais só vêem projetos onde são membros
        projects = conn.execute(
            """
            SELECT p.*, u.name as creator_name,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
            (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
            FROM projects p
            JOIN users u ON p.created_by = u.id
            JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = ?
            ORDER BY p.created_at DESC
            """,
            (current_user["id"],)
        ).fetchall()
        
    conn.close()
    return jsonify([dict(p) for p in projects])


@app.route("/api/projects", methods=["POST"])
@token_required
@roles_allowed("admin", "manager")
def create_project(current_user):
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"message": "O nome do projeto é obrigatório!"}), 400
        
    name = data.get("name")
    description = data.get("description", "")
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)",
            (name, description, current_user["id"])
        )
        project_id = cursor.lastrowid
        
        # Adiciona automaticamente o criador do projeto como membro dele
        cursor.execute(
            "INSERT INTO project_members (project_id, user_id) VALUES (?, ?)",
            (project_id, current_user["id"])
        )
        conn.commit()
        return jsonify({"message": "Projeto criado com sucesso!", "project_id": project_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"message": f"Erro ao criar projeto: {e}"}), 500
    finally:
        conn.close()


@app.route("/api/projects/<int:project_id>", methods=["PUT"])
@token_required
@roles_allowed("admin", "manager")
def update_project(current_user, project_id):
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"message": "O nome do projeto é obrigatório!"}), 400
        
    name = data.get("name")
    description = data.get("description", "")
    
    conn = get_db_connection()
    # Se for gerente, validar se é criador ou membro do projeto
    if current_user["role"] == "manager":
        project = conn.execute("SELECT created_by FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not project:
            conn.close()
            return jsonify({"message": "Projeto não encontrado!"}), 404
            
    conn.execute(
        "UPDATE projects SET name = ?, description = ? WHERE id = ?",
        (name, description, project_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Projeto atualizado com sucesso!"})


@app.route("/api/projects/<int:project_id>", methods=["DELETE"])
@token_required
@roles_allowed("admin", "manager")
def delete_project(current_user, project_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Projeto excluído com sucesso!"})


# ==========================================
# ROTAS DE ASSOCIAÇÃO DE MEMBROS AO PROJETO
# ==========================================

@app.route("/api/projects/<int:project_id>/members", methods=["GET"])
@token_required
def list_project_members(current_user, project_id):
    conn = get_db_connection()
    members = conn.execute(
        """
        SELECT u.id, u.name, u.email, u.role FROM users u
        JOIN project_members pm ON u.id = pm.user_id
        WHERE pm.project_id = ?
        """,
        (project_id,)
    ).fetchall()
    
    # Busca também usuários que NÃO são membros ainda (útil para dropdown de adição)
    all_users = conn.execute(
        """
        SELECT id, name, email, role FROM users 
        WHERE id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?)
        """,
        (project_id,)
    ).fetchall()
    
    conn.close()
    return jsonify({
        "members": [dict(m) for m in members],
        "available_users": [dict(u) for u in all_users]
    })


@app.route("/api/projects/<int:project_id>/members", methods=["POST"])
@token_required
@roles_allowed("admin", "manager")
def add_project_member(current_user, project_id):
    data = request.get_json()
    if not data or not data.get("user_id"):
        return jsonify({"message": "ID do usuário é obrigatório!"}), 400
        
    user_id = data.get("user_id")
    
    conn = get_db_connection()
    try:
        conn.execute(
            "INSERT INTO project_members (project_id, user_id) VALUES (?, ?)",
            (project_id, user_id)
        )
        conn.commit()
        return jsonify({"message": "Membro adicionado com sucesso!"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"message": "Usuário já participa deste projeto!"}), 400
    finally:
        conn.close()


@app.route("/api/projects/<int:project_id>/members/<int:user_id>", methods=["DELETE"])
@token_required
@roles_allowed("admin", "manager")
def remove_project_member(current_user, project_id, user_id):
    conn = get_db_connection()
    conn.execute(
        "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
        (project_id, user_id)
    )
    # Se a pessoa tinha tarefas nesse projeto, desassocia as tarefas
    conn.execute(
        "UPDATE tasks SET assigned_to = NULL WHERE project_id = ? AND assigned_to = ?",
        (project_id, user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Membro removido do projeto com sucesso!"})


# ==========================================
# ROTAS DE TAREFAS
# ==========================================

@app.route("/api/tasks", methods=["GET"])
@token_required
def list_tasks(current_user):
    project_id = request.args.get("project_id")
    status = request.args.get("status")
    
    query = """
        SELECT t.*, p.name as project_name, u.name as assigned_name, u.email as assigned_email
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE 1=1
    """
    params = []
    
    # Se o usuário não for admin nem gerente, restringir apenas aos projetos dele
    if current_user["role"] not in ["admin", "manager"]:
        query += " AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)"
        params.append(current_user["id"])
        
    if project_id:
        query += " AND t.project_id = ?"
        params.append(project_id)
        
    if status:
        query += " AND t.status = ?"
        params.append(status)
        
    query += " ORDER BY t.due_date ASC, t.created_at DESC"
    
    conn = get_db_connection()
    tasks = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(t) for t in tasks])


@app.route("/api/tasks", methods=["POST"])
@token_required
@roles_allowed("admin", "manager")
def create_task(current_user):
    data = request.get_json()
    if not data or not data.get("title") or not data.get("project_id"):
        return jsonify({"message": "Título e Projeto são obrigatórios!"}), 400
        
    title = data.get("title")
    description = data.get("description", "")
    project_id = data.get("project_id")
    status = data.get("status", "todo")
    assigned_to = data.get("assigned_to") or None
    due_date = data.get("due_date") or None # Format: YYYY-MM-DD
    
    if status not in ["todo", "in_progress", "done"]:
        return jsonify({"message": "Status de tarefa inválido!"}), 400
        
    conn = get_db_connection()
    # Verifica se o responsável (se informado) é membro do projeto
    if assigned_to:
        member = conn.execute(
            "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
            (project_id, assigned_to)
        ).fetchone()
        if not member:
            conn.close()
            return jsonify({"message": "O responsável precisa ser membro do projeto correspondente!"}), 400
            
    conn.execute(
        """
        INSERT INTO tasks (title, description, project_id, status, assigned_to, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (title, description, project_id, status, assigned_to, due_date)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Tarefa criada com sucesso!"}), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
@token_required
@roles_allowed("admin", "manager")
def update_task(current_user, task_id):
    data = request.get_json()
    if not data or not data.get("title"):
        return jsonify({"message": "O título da tarefa é obrigatório!"}), 400
        
    title = data.get("title")
    description = data.get("description", "")
    status = data.get("status", "todo")
    assigned_to = data.get("assigned_to") or None
    due_date = data.get("due_date") or None
    
    if status not in ["todo", "in_progress", "done"]:
        return jsonify({"message": "Status de tarefa inválido!"}), 400
        
    conn = get_db_connection()
    task = conn.execute("SELECT project_id FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        conn.close()
        return jsonify({"message": "Tarefa não encontrada!"}), 404
        
    project_id = task["project_id"]
    
    # Verifica se o responsável é membro do projeto
    if assigned_to:
        member = conn.execute(
            "SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?",
            (project_id, assigned_to)
        ).fetchone()
        if not member:
            conn.close()
            return jsonify({"message": "O responsável precisa ser membro do projeto correspondente!"}), 400
            
    conn.execute(
        """
        UPDATE tasks SET title = ?, description = ?, status = ?, assigned_to = ?, due_date = ?
        WHERE id = ?
        """,
        (title, description, status, assigned_to, due_date, task_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Tarefa atualizada com sucesso!"})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
@token_required
@roles_allowed("admin", "manager")
def delete_task(current_user, task_id):
    conn = get_db_connection()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Tarefa excluída com sucesso!"})


@app.route("/api/tasks/<int:task_id>/status", methods=["PATCH"])
@token_required
def update_task_status(current_user, task_id):
    """Atualiza o status da tarefa. Qualquer usuário que seja responsável pela tarefa (ou admin/gerente) pode alterar."""
    data = request.get_json()
    if not data or not data.get("status"):
        return jsonify({"message": "O status é obrigatório!"}), 400
        
    status = data.get("status")
    if status not in ["todo", "in_progress", "done"]:
        return jsonify({"message": "Status inválido!"}), 400
        
    conn = get_db_connection()
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    
    if not task:
        conn.close()
        return jsonify({"message": "Tarefa não encontrada!"}), 404
        
    # Se o usuário for comum, verificar se ele é o responsável por essa tarefa
    if current_user["role"] not in ["admin", "manager"]:
        if task["assigned_to"] != current_user["id"]:
            conn.close()
            return jsonify({"message": "Você só pode alterar o status das tarefas atribuídas a você!"}), 403
            
    conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Status da tarefa atualizado com sucesso!"})


# ==========================================
# SIMULAÇÃO DE ALERTAS DE E-MAIL
# ==========================================

@app.route("/api/alerts", methods=["GET"])
@token_required
def list_alerts(current_user):
    """Retorna a caixa de e-mails enviados simulados (para exibição no Dashboard)."""
    conn = get_db_connection()
    alerts = conn.execute("SELECT * FROM email_alerts ORDER BY sent_at DESC").fetchall()
    conn.close()
    return jsonify([dict(a) for a in alerts])


def send_real_email(to_email, subject, body):
    """Tenta enviar um e-mail de verdade via SMTP se estiver configurado."""
    if not Config.SMTP_SERVER or not Config.SMTP_USER:
        return False  # Não configurado
        
    try:
        msg = MIMEMultipart()
        msg["From"] = Config.SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
        
        msg.attach(MIMEText(body, "plain", "utf-8"))
        
        server = smtplib.SMTP(Config.SMTP_SERVER, Config.SMTP_PORT)
        server.starttls()
        server.login(Config.SMTP_USER, Config.SMTP_PASSWORD)
        server.sendmail(Config.SMTP_FROM, to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"Erro ao enviar e-mail real via SMTP: {e}")
        return False


@app.route("/api/alerts/check", methods=["POST"])
@token_required
def check_deadlines_and_alert(current_user):
    """Varre tarefas pendentes/em andamento, identifica vencimento próximo ou atraso e dispara alertas."""
    conn = get_db_connection()
    
    # Busca todas as tarefas ativas ('todo', 'in_progress') com prazo definido
    tasks = conn.execute(
        """
        SELECT t.id, t.title, t.due_date, t.status, p.name as project_name, u.name as user_name, u.email as user_email
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        JOIN users u ON t.assigned_to = u.id
        WHERE t.status != 'done' AND t.due_date IS NOT NULL
        """
    ).fetchall()
    
    today = datetime.date.today()
    alerts_created = 0
    
    for task in tasks:
        due_date_str = task["due_date"]
        try:
            due_date = datetime.datetime.strptime(due_date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
            
        subject = ""
        body = ""
        is_alertable = False
        
        if due_date < today:
            # Tarefa Atrasada
            subject = f"[TaskFlow] URGENTE: Tarefa atrasada - {task['title']}"
            body = (
                f"Olá, {task['user_name']}.\n\n"
                f"A tarefa '{task['title']}' do projeto '{task['project_name']}' está ATRASADA!\n"
                f"O prazo final era: {due_date_str}.\n"
                f"Por favor, atualize o status da tarefa ou negocie um novo prazo com seu gerente.\n\n"
                f"Atenciosamente,\nEquipe TaskFlow"
            )
            is_alertable = True
        elif today <= due_date <= (today + datetime.timedelta(days=3)):
            # Tarefa próxima do vencimento (até 3 dias)
            days_left = (due_date - today).days
            dias_texto = f"{days_left} dia(s)" if days_left > 0 else "hoje"
            subject = f"[TaskFlow] Lembrete: Vencimento da tarefa - {task['title']}"
            body = (
                f"Olá, {task['user_name']}.\n\n"
                f"A tarefa '{task['title']}' do projeto '{task['project_name']}' vence {dias_texto} ({due_date_str}).\n"
                f"Por favor, não se esqueça de realizar a entrega e atualizar o status no sistema.\n\n"
                f"Atenciosamente,\nEquipe TaskFlow"
            )
            is_alertable = True
            
        if is_alertable:
            # Verifica se já enviamos este e-mail hoje para evitar spam
            today_start = f"{today} 00:00:00"
            existing_alert = conn.execute(
                """
                SELECT 1 FROM email_alerts 
                WHERE to_email = ? AND subject = ? AND sent_at >= ?
                """,
                (task["user_email"], subject, today_start)
            ).fetchone()
            
            if not existing_alert:
                # 1. Registra no banco (para visualização no dashboard simulado)
                conn.execute(
                    "INSERT INTO email_alerts (to_email, subject, body) VALUES (?, ?, ?)",
                    (task["user_email"], subject, body)
                )
                conn.commit()
                
                # 2. Tenta disparar e-mail real via SMTP
                sent_real = send_real_email(task["user_email"], subject, body)
                
                # Log no terminal
                status_real = "SMTP Real" if sent_real else "Simulado"
                print(f"[ALERTA DISPARADO - {status_real}] Destino: {task['user_email']} | Assunto: {subject}")
                
                alerts_created += 1
                
    conn.close()
    return jsonify({"message": "Varredura concluída com sucesso!", "alerts_generated": alerts_created})


# ==========================================
# GERAÇÃO DE RELATÓRIO PDF (FPDF2)
# ==========================================

@app.route("/api/reports/project/<int:project_id>", methods=["GET"])
@token_required
def generate_project_report(current_user, project_id):
    """Gera um relatório executivo em PDF de um projeto específico."""
    conn = get_db_connection()
    
    # Carrega dados do projeto
    project = conn.execute(
        """
        SELECT p.*, u.name as creator_name 
        FROM projects p 
        JOIN users u ON p.created_by = u.id 
        WHERE p.id = ?
        """, 
        (project_id,)
    ).fetchone()
    
    if not project:
        conn.close()
        return jsonify({"message": "Projeto não encontrado!"}), 404
        
    # Carrega todas as tarefas do projeto
    tasks = conn.execute(
        """
        SELECT t.*, u.name as assigned_name 
        FROM tasks t 
        LEFT JOIN users u ON t.assigned_to = u.id 
        WHERE t.project_id = ?
        ORDER BY t.status, t.due_date
        """,
        (project_id,)
    ).fetchall()
    
    # Carrega os membros do projeto
    members = conn.execute(
        """
        SELECT u.name, u.email, u.role 
        FROM users u 
        JOIN project_members pm ON u.id = pm.user_id 
        WHERE pm.project_id = ?
        """,
        (project_id,)
    ).fetchall()
    
    conn.close()
    
    # Calcula estatísticas
    total_tasks = len(tasks)
    todo_tasks = sum(1 for t in tasks if t["status"] == "todo")
    in_progress_tasks = sum(1 for t in tasks if t["status"] == "in_progress")
    done_tasks = sum(1 for t in tasks if t["status"] == "done")
    
    # Cria o PDF usando fpdf2
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(15, 15, 15)
    
    # Cores personalizadas (harmoniosas, azul escuro e cinzas)
    pdf.set_text_color(33, 43, 54) # Grafite escuro
    
    # Título Principal
    pdf.set_font("helvetica", "B", 20)
    pdf.cell(0, 15, "TaskFlow - Relatório do Projeto", border=0, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(100, 116, 139)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(5)
    
    # Informações Gerais
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(40, 8, "Nome do Projeto:")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 8, project["name"], new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(40, 8, "Criado por:")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 8, project["creator_name"], new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(40, 8, "Data de Emissão:")
    pdf.set_font("helvetica", "", 12)
    pdf.cell(0, 8, datetime.datetime.now().strftime("%d/%m/%Y %H:%M"), new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(40, 8, "Descrição:")
    pdf.set_font("helvetica", "", 12)
    pdf.multi_cell(0, 8, project["description"] or "Nenhuma descrição fornecida.")
    pdf.ln(5)
    
    # Indicadores do Projeto
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Progresso do Projeto", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "", 10)
    pdf.cell(45, 8, f"Total de Tarefas: {total_tasks}", border=1, align="C")
    pdf.cell(45, 8, f"A Fazer: {todo_tasks}", border=1, align="C")
    pdf.cell(45, 8, f"Em Andamento: {in_progress_tasks}", border=1, align="C")
    pdf.cell(45, 8, f"Concluídas: {done_tasks}", border=1, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    
    # Lista de Membros do Projeto
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Equipe do Projeto", new_x="LMARGIN", new_y="NEXT")
    
    # Cabeçalho da Tabela de Membros
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(60, 8, "Nome", border=1, fill=True)
    pdf.cell(70, 8, "E-mail", border=1, fill=True)
    pdf.cell(50, 8, "Função", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
    
    # Corpo da Tabela de Membros
    pdf.set_font("helvetica", "", 10)
    for member in members:
        role_label = "Administrador" if member["role"] == "admin" else "Gerente" if member["role"] == "manager" else "Colaborador"
        pdf.cell(60, 8, member["name"], border=1)
        pdf.cell(70, 8, member["email"], border=1)
        pdf.cell(50, 8, role_label, border=1, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)
    
    # Lista de Tarefas do Projeto
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Lista de Tarefas", new_x="LMARGIN", new_y="NEXT")
    
    # Cabeçalho da Tabela de Tarefas
    pdf.set_fill_color(241, 245, 249)
    pdf.set_font("helvetica", "B", 10)
    pdf.cell(60, 8, "Título da Tarefa", border=1, fill=True)
    pdf.cell(45, 8, "Responsável", border=1, fill=True)
    pdf.cell(40, 8, "Prazo", border=1, fill=True)
    pdf.cell(35, 8, "Status", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")
    
    # Corpo da Tabela de Tarefas
    pdf.set_font("helvetica", "", 9)
    for task in tasks:
        status_label = "A Fazer" if task["status"] == "todo" else "Em Andamento" if task["status"] == "in_progress" else "Concluída"
        due_date_formatted = datetime.datetime.strptime(task["due_date"], "%Y-%m-%d").strftime("%d/%m/%Y") if task["due_date"] else "Sem Prazo"
        
        pdf.cell(60, 8, task["title"], border=1)
        pdf.cell(45, 8, task["assigned_name"] or "Sem responsável", border=1)
        pdf.cell(40, 8, due_date_formatted, border=1)
        pdf.cell(35, 8, status_label, border=1, new_x="LMARGIN", new_y="NEXT")
        
    # Geração dos bytes do PDF para o Response
    pdf_bytes = pdf.output()
    
    response = make_response(pdf_bytes)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = f"attachment; filename=relatorio_projeto_{project_id}.pdf"
    return response


# ==========================================
# INICIALIZADOR DO SERVIDOR FLASK
# ==========================================

if __name__ == "__main__":
    # Roda o servidor local na porta 5000
    app.run(debug=True, port=5000)

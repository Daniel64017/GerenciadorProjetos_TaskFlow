import sqlite3
import os
import bcrypt
from config import Config

def get_db_connection():
    """Retorna uma conexão aberta com o banco de dados SQLite."""
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row  # Permite acessar colunas por nome
    conn.execute("PRAGMA foreign_keys = ON")  # Habilita suporte a chaves estrangeiras
    return conn

def init_db():
    """Cria as tabelas se não existirem e insere usuários padrão de teste."""
    # Garante que o arquivo schema.sql existe e lê seu conteúdo
    schema_path = "schema.sql"
    if not os.path.exists(schema_path):
        raise FileNotFoundError(f"Arquivo {schema_path} não encontrado!")
        
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    conn = get_db_connection()
    try:
        # Executa as queries do schema
        conn.executescript(schema_sql)
        conn.commit()
        
        # Seed de usuários de teste se a tabela estiver vazia
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        count = cursor.fetchone()[0]
        
        if count == 0:
            print("Populando banco de dados com usuários de teste...")
            
            # Criptografa as senhas padrão
            admin_pw = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            manager_pw = bcrypt.hashpw("manager123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            user_pw = bcrypt.hashpw("user123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            users_to_insert = [
                ("Administrador", "admin@taskflow.com", admin_pw, "admin"),
                ("Gerente de Projeto", "manager@taskflow.com", manager_pw, "manager"),
                ("Usuário Padrão", "user@taskflow.com", user_pw, "user")
            ]
            
            cursor.executemany(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                users_to_insert
            )
            conn.commit()
            print("Usuários padrão criados com sucesso!")
            
    except Exception as e:
        print(f"Erro ao inicializar o banco de dados: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()

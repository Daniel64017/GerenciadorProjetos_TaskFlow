# TaskFlow - Sistema de Gerenciamento de Projetos e Tarefas

O **TaskFlow** é uma aplicação web leve e moderna desenvolvida em Python (Flask) no back-end, SQLite como banco de dados relacional e HTML/CSS/JavaScript puro (sem frameworks complexos) no front-end. O sistema foi projetado para facilitar o controle de projetos acadêmicos e corporativos por meio de quadros Kanban, dashboards de indicadores, varredura de prazos com alertas e geração de relatórios executivos em PDF.

Vídeo da Apresentação no Youtube: 

👉 **[https://youtu.be/-Qy1Xv4JtkU)**

---

## 🚀 Como Executar o Projeto no seu Computador

Siga os passos abaixo para rodar a aplicação localmente:

### 1. Pré-requisitos
* Ter o **Python 3.x** instalado na máquina.

### 2. Instalação das Dependências
Abra o terminal (PowerShell, Prompt de Comando ou terminal do VS Code) na pasta raiz do projeto e execute:
```bash
pip install -r requirements.txt
```

### 3. Executando o Servidor
Com as dependências instaladas, inicie o servidor Python executando:
```bash
python app.py
```
*O banco de dados SQLite (`database.db`) e as tabelas serão criados e populados com usuários de teste automaticamente no primeiro início.*

### 4. Acessando a Aplicação
Abra o seu navegador de internet e acesse o endereço:
👉 **[http://127.0.0.1:5000](http://127.0.0.1:5000)**

---

## 🔑 Credenciais de Teste Pré-cadastradas

Para testar as diferentes restrições de permissões baseadas em perfis, utilize as contas padrão abaixo:

* **Administrador**: `admin@taskflow.com` | Senha: `admin123`
* **Gerente de Projetos**: `manager@taskflow.com` | Senha: `manager123`
* **Colaborador**: `user@taskflow.com` | Senha: `user123`

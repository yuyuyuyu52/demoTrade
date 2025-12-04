# Demo Trading System

## 本地运行指南 (不使用 Docker)

### 1. 环境要求
*   Python 3.9+
*   PostgreSQL (本地安装并运行)

### 2. 数据库设置
你需要创建一个 PostgreSQL 数据库和用户，或者修改 `.env` 文件以匹配你现有的配置。

**方式 A: 使用默认配置 (推荐)**
在终端运行以下命令 (需要安装 `postgresql` 客户端):

```bash
# 登录默认 postgres 数据库
psql postgres

# 在 psql 提示符下执行:
CREATE USER "user" WITH PASSWORD 'password';
CREATE DATABASE tradingsystem OWNER "user";
\q
```

**方式 B: 修改配置**
如果你已有数据库，请修改项目根目录下的 `.env` 文件：
```
DATABASE_URL=postgresql+asyncpg://你的用户名:你的密码@localhost:5432/你的数据库名
```

### 3. 安装依赖
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 4. 运行服务
```bash
uvicorn app.main:app --reload
```

服务启动后：
*   API 文档: http://127.0.0.1:8000/docs

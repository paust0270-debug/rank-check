# Database Setup Guide

## PostgreSQL Setup with Docker

Turafic uses PostgreSQL as its database. The easiest way to run PostgreSQL locally is using Docker.

### Prerequisites

- Docker Desktop installed ([Download](https://www.docker.com/products/docker-desktop))
- Docker running on your system

### Quick Start

```bash
# 1. Start PostgreSQL
npm run db:up

# 2. Wait for database to be ready (check logs)
npm run db:logs

# 3. Run migrations
npm run db:push

# 4. (Optional) Open Drizzle Studio to view database
npm run db:studio
```

### Database Scripts

| Script | Description |
|--------|-------------|
| `npm run db:up` | Start PostgreSQL container |
| `npm run db:down` | Stop and remove PostgreSQL container |
| `npm run db:logs` | View PostgreSQL logs |
| `npm run db:push` | Generate and run migrations |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |

### Database Configuration

**Connection Details:**
- Host: `localhost`
- Port: `5432`
- Database: `turafic`
- Username: `postgres`
- Password: `password`

**Connection String:**
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/turafic
```

This is already configured in `.env`.

### Database Schema

The database includes the following tables:

#### Core Tables

1. **users** - User accounts
2. **campaigns** - Campaign metadata
3. **bots** - Bot network management
4. **variableCombinations** - Variable optimization data

#### New Tables (Phase 3)

5. **tasks** - Individual rank check tasks (10 variables)
   ```sql
   - uaChange, cookieHomeMode, shopHome, useNid, useImage
   - workType, randomClickCount, workMore, secFetchSiteMode, lowDelay
   ```

6. **taskLogs** - Task execution logs for debugging
   ```sql
   - taskId, level (info/warning/error), message, metadata
   ```

7. **naverCookies** - Cookie pool management
   ```sql
   - nnb, nidAut, nidSes, nidJkl, isActive, lastUsedAt
   ```

8. **rankings** - Rank check results

### Viewing Database

#### Option 1: Drizzle Studio (Recommended)

```bash
npm run db:studio
```

Opens a web interface at `http://localhost:4983`

#### Option 2: pgAdmin (Docker)

```bash
# Start pgAdmin
docker-compose --profile tools up -d pgadmin

# Access pgAdmin
# URL: http://localhost:5050
# Email: admin@turafic.local
# Password: admin
```

Then add server connection:
- Host: `postgres` (container name)
- Port: `5432`
- Database: `turafic`
- Username: `postgres`
- Password: `password`

### Troubleshooting

#### Database not starting

```bash
# Check if Docker is running
docker ps

# Check database logs
npm run db:logs

# Restart database
npm run db:down
npm run db:up
```

#### Migration errors

```bash
# Check database connection
docker exec -it turafic-postgres psql -U postgres -d turafic -c "\dt"

# Reset database (WARNING: deletes all data)
npm run db:down
docker volume rm turafic_postgres_data
npm run db:up
npm run db:push
```

#### Port 5432 already in use

Another PostgreSQL instance is running. Either:
1. Stop the other instance
2. Change the port in `docker-compose.yml` (e.g., `5433:5432`)

### Manual Setup (Without Docker)

If you prefer to install PostgreSQL directly:

1. **Install PostgreSQL 17**
   - Windows: https://www.postgresql.org/download/windows/
   - Mac: `brew install postgresql@17`
   - Linux: `sudo apt-get install postgresql-17`

2. **Create database**
   ```bash
   psql -U postgres
   CREATE DATABASE turafic;
   \q
   ```

3. **Update .env** (if needed)
   ```
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/turafic
   ```

4. **Run migrations**
   ```bash
   npm run db:push
   ```

### Production Deployment

For production, use managed PostgreSQL services:

- **AWS RDS PostgreSQL**
- **Google Cloud SQL**
- **Azure Database for PostgreSQL**
- **Supabase** (Free tier available)
- **Railway** (Free tier available)

Update `DATABASE_URL` environment variable with the production connection string.

### Backup & Restore

#### Backup

```bash
# Backup to file
docker exec turafic-postgres pg_dump -U postgres turafic > backup_$(date +%Y%m%d).sql
```

#### Restore

```bash
# Restore from file
docker exec -i turafic-postgres psql -U postgres turafic < backup_20251120.sql
```

### Schema Updates

When adding/modifying tables:

1. Update `drizzle/schema.ts`
2. Generate migration: `npm run db:push`
3. Commit both schema and migration files
4. Other developers run `npm run db:push` to apply

### Development Workflow

```bash
# Terminal 1: Start database
npm run db:up

# Terminal 2: Start development server
npm run dev:windows

# Terminal 3: (Optional) View logs
npm run db:logs
```

---

**Created:** 2025-11-20
**Last Updated:** 2025-11-20
**Related Docs:** IMPLEMENTATION_PLAN.md, SYSTEM_DESIGN.md

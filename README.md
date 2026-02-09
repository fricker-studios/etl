# ETL Pipeline Studio
[![Release to Production](https://github.com/fricker-studios/etl/actions/workflows/release.yml/badge.svg)](https://github.com/fricker-studios/etl/actions/workflows/release.yml)
[![Release](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.github.com%2Frepos%2Ffricker-studios%2Fetl%2Freleases%2Flatest&query=%24.tag_name&label=release&cacheSeconds=60)](https://github.com/fricker-studios/etl/releases/latest)

A full-stack ETL/ELT pipeline management tool with Django backend and React frontend.

## Features

- **Authentication**: JWT-based authentication with login (no signup by default)
- **Data Sources**: Manage API sources with various authentication methods
- **Streams**: Define data streams with pagination and schema inference
- **Data Packages**: Create and materialize data packages from streams
- **Data Models**: Support for both Dimensional and Data Vault modeling
- **Backend Storage**: Configure S3 and ClickHouse storage backends
- **Task Queue**: Celery-based asynchronous task execution for stream processing
- **Scheduled Execution**: Celery Beat integration for scheduled stream runs
- **Run Tracking**: Automatic tracking of stream execution history and status

## Architecture

- **Backend**: Django + Django REST Framework + PostgreSQL
- **Frontend**: React + TypeScript + Vite + Mantine UI
- **Task Queue**: Celery + Redis for asynchronous task execution
- **Scheduler**: Celery Beat for scheduled stream execution
- **Data Layer**: TanStack Query (React Query) for caching and state management
- **Authentication**: JWT tokens via djangorestframework-simplejwt
- **API Documentation**: Swagger UI via drf-spectacular
- **Error Tracking**: Sentry for both frontend and backend

For detailed frontend architecture, see [frontend/ARCHITECTURE.md](frontend/ARCHITECTURE.md).

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Running with Docker

1. Clone the repository:
```bash
git clone https://github.com/fricker-studios/etl.git
cd etl
```

2. Start the services:
```bash
docker-compose up -d
```

3. Run database migrations:
```bash
docker-compose exec api python manage.py migrate
```

4. Set up periodic tasks for scheduled streams:
```bash
docker-compose exec api python manage.py setup_periodic_tasks
```

5. Create a superuser:
```bash
docker-compose exec api python manage.py createsuperuser
```

6. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000/api
   - Admin Panel: http://localhost:8000/admin
   - API Documentation: http://localhost:8000/api/docs

### Local Development

#### Backend Setup

1. Create and activate a virtual environment:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run migrations:
```bash
python manage.py migrate
```

5. Create a superuser:
```bash
python manage.py createsuperuser
```

6. Start the development server:
```bash
python manage.py runserver
```

#### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API URL
```

3. Start the development server:
```bash
npm run dev
```

## Environment Variables

### Backend (.env)

```bash
SECRET_KEY=your-secret-key-here
DEBUG=True
DB_NAME=etl
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost  # or 'db' for Docker
DB_PORT=5432
ALLOWED_HOSTS=*
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
CELERY_BROKER_URL=redis://localhost:6379/0  # or 'redis://redis:6379/0' for Docker
CELERY_RESULT_BACKEND=redis://localhost:6379/0  # or 'redis://redis:6379/0' for Docker
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:8000/api
```

## API Endpoints

- `POST /api/auth/login/` - Login and get JWT tokens
- `GET /api/auth/me/` - Get current user info
- `GET/POST /api/storage-backends/` - Manage storage backends
- `GET/POST /api/api-sources/` - Manage API sources
- `GET/POST /api/streams/` - Manage streams
- `GET/POST /api/packages/` - Manage data packages
- `GET/POST /api/models/` - Manage data models

## Project Structure

```
etl/
├── backend/
│   ├── authentication/         # JWT authentication
│   ├── core/                  # Core models, views, serializers
│   │   ├── models.py          # Django models
│   │   ├── views.py           # DRF ViewSets
│   │   ├── serializers.py     # API serializers
│   │   ├── urls.py            # API routes
│   │   ├── encryption.py      # Field encryption utilities
│   │   ├── s3_utils.py        # S3 integration
│   │   └── scheduler.py       # Background task scheduler
│   ├── config/                # Django settings
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/              # App shell and routing
│   │   ├── components/
│   │   │   └── common/       # Reusable UI components
│   │   ├── features/         # Feature-specific components
│   │   ├── hooks/            # React Query custom hooks
│   │   ├── lib/              # Configuration (QueryClient)
│   │   ├── pages/            # Page components
│   │   ├── store/            # Zustand stores (auth)
│   │   └── utils/            # Utilities and API client
│   ├── ARCHITECTURE.md       # Frontend architecture docs
│   └── package.json
└── docker-compose.yml
```

## Development Commands

### Backend

```bash
# Run migrations
python manage.py migrate

# Create migrations
python manage.py makemigrations

# Create superuser
python manage.py createsuperuser

# Set up periodic tasks for scheduled streams
python manage.py setup_periodic_tasks

# Execute a stream manually
python manage.py execute_stream <stream_id>

# Run tests
python manage.py test

# Start Celery worker (for local development)
celery -A config worker -l info

# Start Celery Beat scheduler (for local development)
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

### Frontend

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Format code
npm run prettier:write
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

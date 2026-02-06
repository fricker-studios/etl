FROM python:3.11-slim
ARG SENTRY_RELEASE_VERSION=dev

EXPOSE 8000

# Keeps Python from generating .pyc files in the container
ENV PYTHONDONTWRITEBYTECODE=1

# Turns off buffering for easier container logging
ENV PYTHONUNBUFFERED=1

ENV DJANGO_SENTRY_RELEASE_VERSION=${SENTRY_RELEASE_VERSION}

WORKDIR /app

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .

# Run migrations and start server
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

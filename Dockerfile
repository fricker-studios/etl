FROM python:3.12-slim
ARG SENTRY_RELEASE_VERSION=dev

EXPOSE 8000

# Keeps Python from generating .pyc files in the container
ENV PYTHONDONTWRITEBYTECODE=1

# Turns off buffering for easier container logging
ENV PYTHONUNBUFFERED=1

ENV DJANGO_SENTRY_RELEASE_VERSION=${SENTRY_RELEASE_VERSION}

# Install python packages
WORKDIR /app
RUN pip install -U pip
RUN pip install poetry==2.3.2
COPY backend/poetry.lock backend/pyproject.toml ./
RUN poetry config virtualenvs.create false && poetry install --no-root

# Copy application code
COPY backend/ .

# Run migrations and start server
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

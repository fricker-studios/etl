POETRY_VERSION=2.1.3
APP_NAME=etl

python-env:
	# Create virtual environment if it doesn't exist
	if [ ! -d .venv ]; then python3 -m venv .venv; fi
	. .venv/bin/activate; \
	pip install -U pip; \
	pip install poetry==$(POETRY_VERSION); \
	poetry config virtualenvs.in-project true; \
# 	poetry install --no-root --with dev
# 	@echo "Environment setup complete."
# 	@echo "Activate with '. .venv/bin/activate', or use 'make shell' to enter a Docker container."

node-env:
	npm --prefix=frontend install

env:node-env python-env
	# Copy .env.example to .env if it doesn't exist
	if [ ! -f .env ]; then cp .env.example .env; fi

clean:
	rm -rf frontend/dist
	rm -rf frontend/node_modules
	rm -rf .venv

api-build:
	docker build -t $(APP_NAME) .

ui-build:
	npm --prefix=frontend run build
	docker build -t $(APP_NAME)-ui -f Dockerfile.nginx .

build:ui-build api-build

migrate: build
	docker compose up -d db
	docker compose run --rm api python manage.py migrate

migrations: build
	docker compose up -d db
	docker compose run --rm api python manage.py makemigrations

runserver: migrate
	docker compose up -d api
	npm --prefix=frontend run dev

pretty:
	docker compose up -d api
	docker compose run --rm api black .
	npm --prefix=frontend run prettier:write

lint:
	docker compose up -d api
	docker compose run --rm api flake8 .
	npm --prefix=frontend run eslint

storybook:
	npm --prefix=frontend run storybook

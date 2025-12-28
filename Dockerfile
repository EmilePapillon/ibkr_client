FROM python:3.11-slim

WORKDIR /app

# Install Node/npm for TypeScript, plus Python deps.
RUN apt-get update \
  && apt-get install -y --no-install-recommends nodejs npm git openssh-client vim-tiny \
  && npm install -g typescript \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Bring in the app and frontend files so tsc can run against main.ts.
COPY . .

EXPOSE 5000
CMD ["python", "backend/app.py"]

# Project Overview
Lightweight portfolio viewer with a TypeScript frontend and a Flask API that handles login and portfolio retrieval, ready to wire into IBKR gateway flows.

## Structure
- `backend/`: Flask app exposing `/api/login` and `/api/portfolio`, plus CLI helpers.
- `main.ts`, `index.html`, `styles.css`, `utils.ts`: Frontend entry and UI logic for positions, filtering, and session handling.
- `dist/`: Built frontend assets.
- `compose-dev.yaml`, `Dockerfile`, `start.sh`: Container and runtime helpers.

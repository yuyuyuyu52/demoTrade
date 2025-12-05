# Deployment Guide

This project is containerized using Docker and Docker Compose, making it easy to deploy on any server.

## Prerequisites

- A server (Linux recommended, e.g., Ubuntu)
- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed

## Deployment Steps

1.  **Clone or Upload the Project**
    Upload the entire project folder to your server.

2.  **Build and Run**
    Navigate to the project directory and run:
    ```bash
    docker-compose up -d --build
    ```
    This command will:
    - Build the backend image.
    - Build the frontend image (compiling the React app).
    - Start the PostgreSQL database.
    - Start the backend service.
    - Start the frontend service (Nginx) on port 80.

3.  **Access the Application**
    Open your browser and visit your server's IP address or domain name (e.g., `http://your-server-ip`).

## Troubleshooting

-   **Check Logs**:
    ```bash
    docker-compose logs -f
    ```
-   **Restart Services**:
    ```bash
    docker-compose restart
    ```
-   **Stop Services**:
    ```bash
    docker-compose down
    ```

## Configuration

-   **Database**: The database credentials are defined in `docker-compose.yml`. For production, change the `POSTGRES_PASSWORD` and update the `DATABASE_URL` in the backend service accordingly.
-   **Ports**: The frontend is exposed on port 80. If you need HTTPS, you can configure Nginx in `frontend/nginx.conf` or put a reverse proxy (like another Nginx or Traefik) in front of this setup.

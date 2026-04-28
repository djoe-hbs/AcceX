#!/bin/bash

# Exit on error
set -e

echo "Starting update process..."

# 1. Pull latest code
echo "Pulling latest changes from Git..."
git pull origin main

# 2. Update Backend
echo "Updating Backend..."
cd api
./venv/bin/pip install boto3 django-storages python-dotenv django-cors-headers djangorestframework-simplejwt djangorestframework django-filter pypdf python-docx openpyxl reportlab pillow
./venv/bin/python manage.py migrate
./venv/bin/python manage.py collectstatic --noinput

# 3. Update Frontend
echo "Updating Frontend..."
cd ../frontend
npm install
npm run build

# 4. Restart Server
echo "Restarting Backend Service..."
sudo systemctl restart accex-backend.service

# 5. Fix permissions
echo "Ensuring correct permissions..."
sudo chown -R www-data:www-data /var/www/accex
sudo chmod -R 775 /var/www/accex/api

echo "Update completed successfully!"

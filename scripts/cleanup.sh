#!/bin/bash

echo "🧹 Cleaning up Cloud Bot Platform..."

# Delete all resources
kubectl delete -f k8s/ --ignore-not-found=true

# Delete namespace (this will delete everything in it)
kubectl delete namespace bot-platform --ignore-not-found=true

# Clean up Docker images
docker rmi cloud-bot-platform:latest --force 2>/dev/null || true

echo "✅ Cleanup completed!"

#!/bin/bash
# Saare K8s manifests ek order me apply karne ke liye helper script.
# Usage: ./scripts/deploy-k8s.sh
set -e
echo "Applying HRMS manifests to Kubernetes..."
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-configmap.yaml
kubectl apply -f k8s/02-secrets.yaml
kubectl apply -f k8s/03-infra-mongo.yaml
kubectl apply -f k8s/04-infra-redis.yaml
kubectl apply -f k8s/05-infra-rabbitmq.yaml
echo "Waiting for infra to be ready..."
kubectl -n hrms rollout status statefulset/mongo --timeout=120s
kubectl -n hrms rollout status deployment/redis --timeout=120s
kubectl -n hrms rollout status deployment/rabbitmq --timeout=120s
kubectl apply -f k8s/10-auth-service.yaml
kubectl apply -f k8s/10-employee-service.yaml
kubectl apply -f k8s/10-attendance-service.yaml
kubectl apply -f k8s/10-notification-service.yaml
kubectl apply -f k8s/20-api-gateway.yaml
kubectl apply -f k8s/21-ingress.yaml
echo "Done. Check: kubectl -n hrms get pods"

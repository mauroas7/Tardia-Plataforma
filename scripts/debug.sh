#!/bin/bash

echo "🔍 Cloud Bot Platform - Debug Information"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if namespace exists
echo "📁 Checking namespace..."
if kubectl get namespace bot-platform &>/dev/null; then
    echo -e "${GREEN}✅ Namespace 'bot-platform' exists${NC}"
else
    echo -e "${RED}❌ Namespace 'bot-platform' not found${NC}"
    exit 1
fi

echo ""
echo "🗄️ MongoDB Status:"
echo "=================="
kubectl get deployment mongodb -n bot-platform -o wide 2>/dev/null || echo -e "${RED}❌ MongoDB deployment not found${NC}"

echo ""
echo "📦 MongoDB Pods:"
kubectl get pods -n bot-platform -l app=mongodb -o wide

echo ""
echo "💾 MongoDB PVC Status:"
kubectl get pvc mongodb-pvc -n bot-platform 2>/dev/null || echo -e "${RED}❌ MongoDB PVC not found${NC}"

echo ""
echo "📋 MongoDB Pod Logs (last 30 lines):"
MONGODB_POD=$(kubectl get pods -n bot-platform -l app=mongodb -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ ! -z "$MONGODB_POD" ]; then
    echo "Pod: $MONGODB_POD"
    kubectl logs $MONGODB_POD -n bot-platform --tail=30
else
    echo -e "${RED}❌ No MongoDB pods found${NC}"
fi

echo ""
echo "🚀 Backend Status:"
echo "=================="
kubectl get deployment backend -n bot-platform -o wide 2>/dev/null || echo -e "${RED}❌ Backend deployment not found${NC}"

echo ""
echo "📦 Backend Pods:"
kubectl get pods -n bot-platform -l app=backend -o wide

echo ""
echo "📋 Backend Pod Logs (last 20 lines):"
BACKEND_POD=$(kubectl get pods -n bot-platform -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ ! -z "$BACKEND_POD" ]; then
    echo "Pod: $BACKEND_POD"
    kubectl logs $BACKEND_POD -n bot-platform --tail=20
else
    echo -e "${RED}❌ No backend pods found${NC}"
fi

echo ""
echo "🎨 Frontend Status:"
echo "=================="
kubectl get deployment frontend -n bot-platform -o wide 2>/dev/null || echo -e "${RED}❌ Frontend deployment not found${NC}"
kubectl get pods -n bot-platform -l app=frontend -o wide

echo ""
echo "🌐 Services:"
kubectl get services -n bot-platform

echo ""
echo "🔐 Secrets:"
kubectl get secrets -n bot-platform

echo ""
echo "🔄 Recent Events:"
kubectl get events -n bot-platform --sort-by='.lastTimestamp' | tail -15

echo ""
echo "📊 Resource Usage:"
kubectl top pods -n bot-platform 2>/dev/null || echo -e "${YELLOW}⚠️ Metrics server not available${NC}"

echo ""
echo "🔍 Storage Classes Available:"
kubectl get storageclass

echo ""
echo "💽 Persistent Volumes:"
kubectl get pv | grep bot-platform || echo "No PVs found for bot-platform"

# Test MongoDB connection if pod is running
if [ ! -z "$MONGODB_POD" ] && kubectl get pod $MONGODB_POD -n bot-platform | grep -q "Running"; then
    echo ""
    echo "🔌 Testing MongoDB Connection:"
    kubectl exec $MONGODB_POD -n bot-platform -- mongosh --eval "db.adminCommand('ping')" 2>/dev/null && \
        echo -e "${GREEN}✅ MongoDB connection successful${NC}" || \
        echo -e "${RED}❌ MongoDB connection failed${NC}"
fi

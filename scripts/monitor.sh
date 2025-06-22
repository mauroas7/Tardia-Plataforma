#!/bin/bash

echo "📊 Cloud Bot Platform - System Status"
echo "======================================"

# Check namespace
echo "📁 Namespace Status:"
kubectl get namespace bot-platform

echo ""
echo "🚀 Deployments Status:"
kubectl get deployments -n bot-platform

echo ""
echo "📦 Pods Status:"
kubectl get pods -n bot-platform

echo ""
echo "🌐 Services Status:"
kubectl get services -n bot-platform

echo ""
echo "💾 Storage Status:"
kubectl get pvc -n bot-platform

echo ""
echo "🤖 Bot Pods (Active Bots):"
kubectl get pods -n bot-platform -l type=telegram-bot

echo ""
echo "📈 Resource Usage:"
kubectl top pods -n bot-platform 2>/dev/null || echo "Metrics server not available"

echo ""
echo "🔍 Recent Events:"
kubectl get events -n bot-platform --sort-by='.lastTimestamp' | tail -10

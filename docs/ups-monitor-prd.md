# 🧠 PRD: UPS Monitor Web App (Raspberry Pi + CyberPower)

## 📌 Overview
Construir una aplicación web ligera que permita visualizar en tiempo real el estado de un UPS conectado a una Raspberry Pi usando NUT.

## 🎯 Objetivos
- Monitorización en tiempo real
- Acceso vía web
- Base para automatizaciones futuras

## ⚙️ Arquitectura
UPS → USB → Raspberry Pi → NUT → Backend API → Web App

## 📊 Funcionalidades MVP
- Estado (OL, OB, LB)
- Batería (%)
- Runtime
- Voltaje entrada/salida
- Carga (%)
- Refresh automático

## 🔌 Comando base
upsc ups@localhost

## 🧠 API
GET /api/ups
GET /api/ups/history?limit=120

## 🚀 Roadmap
Fase 1: MVP
Fase 2: mejoras (gráficos, historial) ✅
Fase 3: alertas y automatización

## 📈 Fase 2 implementada
- Logging persistente en JSONL (`data/ups_history.jsonl`)
- Endpoint de historial para frontend: `GET /api/ups/history`
- Gráfico histórico en dashboard (batería % y carga %)
- Retención configurable con `UPS_HISTORY_MAX_ENTRIES`

## 🧱 Ejemplo Python
import subprocess

def get_ups_data():
    result = subprocess.run(["upsc", "ups@localhost"], capture_output=True, text=True)
    return result.stdout

## 🚀 GO!
1. Instalar NUT
2. Verificar conexión
3. Crear API
4. Crear UI

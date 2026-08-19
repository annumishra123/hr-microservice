# HRMS — Microservices Architecture (Advanced)

Ye tumhare monolithic auth code (register/login/refresh/OTP/device-tracking) ko
base bana ke, ek **full microservices system** banaya gaya hai — event-driven,
Redis + RabbitMQ + Socket.IO + Docker + Kubernetes (with autoscaling) ke saath.

> **Honest note:** Ye ek solid, working **reference architecture** hai — sab
> pieces genuinely connected aur functional hain. Lekin "3 lakh users
> production" ke liye tumhe aage load-testing, managed DB clusters
> (MongoDB Atlas/replica set), monitoring (Prometheus+Grafana), aur CI/CD
> bhi lagana padega — wo iss scaffold pe build karne wali cheezein hain.

---

## 1. High-Level Architecture

```
                         ┌─────────────────────┐
        Client (App/Web) │                      │
        ────────────────▶│    API GATEWAY       │  (single public entry point)
                         │  - Rate limiting     │
                         │  - JWT verification  │
                         │  - Request routing   │
                         └──────────┬───────────┘
                                    │
        ┌────────────┬──────────────┼───────────────┬────────────────┐
        ▼             ▼              ▼               ▼
 ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐
 │auth-service │ │employee-svc  │ │attendance-svc│ │notification-service│
 │  (Mongo)    │ │  (Mongo)     │ │  (Mongo)     │ │ (Mongo + Socket.IO)│
 └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────────┬─────────┘
        │               │                │                     │
        └───────────────┴────────────────┴─────────────────────┘
                              │
                      ┌───────▼────────┐
                      │   RabbitMQ     │   <- Event Bus (Topic Exchange)
                      │  "hrms.events" │
                      └────────────────┘
                              │
                      ┌───────▼────────┐
                      │     Redis      │   <- Rate-limit store, cache,
                      │                │      Socket.IO adapter
                      └────────────────┘
```

**Core idea:** Har service ka apna database hai (database-per-service). Services
ek-doosre ke DB ko kabhi directly query nahi karte. Jab bhi ek service me kuch
important hota hai (user register hua, koi check-in hua), wo ek **event**
RabbitMQ pe publish kar deta hai. Jis-jis service ko us event me interest hai,
wo apni queue se usko consume kar leta hai aur apna kaam karta hai. Isse
services loosely-coupled rehte hain — ek service down/slow ho jaaye to poora
system nahi girta.

---

## 2. Services — kya, kyu, kaise

### `api-gateway` (Port 4000 — sirf yehi public hai)
- **Kya karta hai:** Client se aane wali har request ka single entry point.
  Route ke hisaab se sahi microservice ko forward (proxy) karta hai.
- **Rate limiting:** `express-rate-limit` + `rate-limit-redis`. Redis-backed
  isliye kyunki gateway khud multiple replicas (pods) me chalega — agar
  rate-limit counter memory me hota, to har pod ka apna alag counter hota
  aur limiter bypass ho jaata. Redis se sab pods EK shared counter use karte
  hain. Layered limits: global (IP-based DDoS protection), auth (login/OTP
  brute-force protection — sirf 10 attempts/15min), api (per authenticated
  user).
- **JWT verification yahin hoti hai (ek jagah):** Gateway token verify karke
  `X-User-Id` header set karke request ko downstream service tak forward
  karta hai. Downstream services isi header pe trust karte hain — is se har
  service me alag se JWT logic likhne ki zaroorat nahi.
- **Correlation ID:** Har request ko ek unique ID milta hai jo saari services
  ke logs me carry hota hai — distributed tracing/debugging ke liye.

### `auth-service` (Port 5001)
Tumhara original code hi hai (register, login, refresh-token, OTP, per-device
refresh tokens, logout, change-password) — bas do cheezein add hui:
1. Register/Login/OTP-request pe respective **events publish** hote hain
   (`user.registered`, `user.logged_in`, `otp.requested`).
2. JWT verification ab gateway pe hoti hai, isliye yahan sirf `X-User-Id`
   header read karta hai (`protect` middleware).

### `employee-service` (Port 5002)
- Ye **`user.registered` event consume karta hai** aur apna khud ka
  `Employee` document banata hai (salary, leave-balance, personal info wagera
  — sab isi service ke DB me, auth-service ke DB me nahi).
- Idempotent hai — same event dobara aaye (jo distributed systems me ho sakta
  hai) to duplicate employee nahi banega.
- **Redis caching:** Employee profile GET requests cache hoti hain (60s TTL)
  — 3 lakh users scale pe dashboard load har baar Mongo hit na kare.
- Pagination hai list endpoint pe (`?page=&limit=`) — bina pagination ke lakhs
  records ek saath fetch karna server ko crash kar dega.

### `attendance-service` (Port 5003)
- Check-in/check-out track karta hai. Har action pe event publish karta hai
  (`attendance.checkin`, `attendance.checkout`) — jisse notification-service
  ko pata chalta hai ki kisko real-time notify karna hai.

### `notification-service` (Port 5004) — event-driven + Socket.IO ka core
- RabbitMQ se 4 tarah ke events sunta hai: `user.registered`, `otp.requested`,
  `attendance.checkin`, `attendance.checkout`.
- Har event pe DB me `Notification` save karta hai AUR agar user abhi
  connected hai to **Socket.IO se real-time push** karta hai.
- **Redis Adapter for Socket.IO:** Jab ye service K8s me multiple pods me
  scale hoga, User-A kisi ek specific pod se connected hoga. Agar event
  kisi doosre pod pe process ho (RabbitMQ round-robin se), us pod ko User-A
  ka socket seedha nahi milega. `@socket.io/redis-adapter` Redis Pub/Sub use
  karke ye broadcast SAARE pods tak deta hai, jo bhi pod us user ko hold
  kar raha hai wahi deliver kar dega. Isके bina Socket.IO horizontally
  scale hi nahi hota.
- Socket connection JWT-authenticated hai (handshake me token bhejna hota
  hai), aur user apne "personal room" (`userId`) me join hota hai — isse
  `io.to(userId).emit(...)` se directly usi user ko target kar sakte hain.

---

## 3. Infra components — kya, kyu

| Component | Kyu use hua |
|---|---|
| **RabbitMQ** | Durable event bus. Redis pub/sub ke bajaye RabbitMQ isliye kyunki agar consumer service down ho (deploy/restart ho raha ho), events queue me safe rehte hain jab tak process nahi ho jaate (at-least-once delivery). Topic exchange (`hrms.events`) se multiple independent consumers ek hi event ko sun sakte hain. |
| **Redis** | Teen alag roles: (1) Rate-limiting shared store, (2) Employee-profile caching, (3) Socket.IO horizontal-scaling adapter. |
| **MongoDB** | Har service ka apna DB (`hrms_auth`, `hrms_employee`, `hrms_attendance`, `hrms_notification`) — database-per-service pattern, services independently deploy/scale ho sakte hain bina ek-doosre ko break kiye. |
| **Docker** | Har service apne Dockerfile me containerized hai — consistent environment dev se prod tak. |
| **Kubernetes** | Production orchestration — auto-restart on crash, rolling deploys, aur sabse zaroori: **HorizontalPodAutoscaler (HPA)**, jo CPU/memory usage dekh ke automatically pods ki count badhata-ghatata hai (traffic spike pe gateway 3->25 pods tak scale ho sakta hai). |

---

## 4. Kaise chalayein (Local — Docker Compose)

```bash
cd hrms-microservices
docker compose up --build
```

Ye sab kuch (Mongo, Redis, RabbitMQ, 4 services, gateway) ek saath khada kar
dega. Test karo:

```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: dev-123" \
  -d '{"name":"Anurag","email":"anurag@test.com","password":"Secure123"}'

# RabbitMQ management UI (dekho events flow ho rahe hain live)
open http://localhost:15672   # guest/guest
```

**RabbitMQ management UI** me tum dekh sakte ho ki `user.registered` event
publish hote hi kaise `employee-service.user-events` aur
`notification-service.all-events` queues me instantly land karta hai.

⚠️ Production me `.env.example` files ko copy karke real `.env` banao aur
`JWT_SECRET` jaise values change karo — abhi placeholder hai.

---

## 5. Kaise chalayein (Kubernetes)

```bash
# 1. Pehle har service ka image build+push karo apne registry pe:
docker build -t your-registry/auth-service:latest ./services/auth-service
docker push your-registry/auth-service:latest
# ... (baaki 4 services ke liye bhi repeat karo)

# 2. k8s/*.yaml files me "your-registry/..." ko apne actual registry se replace karo

# 3. Deploy:
./scripts/deploy-k8s.sh

# 4. Check:
kubectl -n hrms get pods
kubectl -n hrms get hpa    # dekho autoscaling status
```

### 3-lakh-user scale ke liye jo already configured hai:
- **HPA** har service pe: `api-gateway` 3→25 pods, baaki services 2→15 pods,
  CPU 60-65% threshold pe scale-out.
- **Readiness/Liveness probes**: unhealthy pod traffic nahi paata, aur
  auto-restart hota hai.
- **Resource requests/limits**: taaki K8s scheduler sahi se bin-pack kare
  aur ek pod poora node hog na kare.

### Jo tumhe khud add karna hoga scale ke liye:
- MongoDB ko **Replica Set** ya **MongoDB Atlas** (managed) — single pod
  StatefulSet production 3-lakh-user load ke liye kaafi nahi.
- Redis **Cluster mode** ya managed (ElastiCache/Upstash) — single point of
  failure abhi hai.
- RabbitMQ **cluster mode** (quorum queues, 3 nodes) — HA ke liye.
- **Prometheus + Grafana** for actual metrics-based monitoring/alerting.
- **CI/CD pipeline** (GitHub Actions → build → push → `kubectl apply`).

---

## 6. Folder Structure

```
hrms-microservices/
├── api-gateway/              # Single entry point, rate-limit, JWT verify, routing
├── services/
│   ├── auth-service/         # Register/login/refresh/OTP/devices (your original logic)
│   ├── employee-service/     # HR profile data, consumes user.registered event
│   ├── attendance-service/   # Check-in/out, publishes attendance events
│   └── notification-service/ # Consumes all events, Socket.IO real-time push
├── shared/                   # Common logger/eventBus/redis client (copied into each service)
├── k8s/                      # Kubernetes manifests (namespace, configmap, secrets,
│                              #   infra: mongo/redis/rabbitmq, per-service deploy+HPA, ingress)
├── scripts/deploy-k8s.sh     # Ordered kubectl apply helper
└── docker-compose.yml        # Local dev — one command spins up everything
```

---

## 7. Event Catalog (RabbitMQ routing keys)

| Event | Publisher | Consumers | Kya hota hai |
|---|---|---|---|
| `user.registered` | auth-service | employee-service, notification-service | Employee profile create + welcome notification |
| `user.logged_in` | auth-service | *(extend as needed)* | Login analytics/audit ke liye ready |
| `otp.requested` | auth-service | notification-service | OTP delivery (SMS/WhatsApp gateway integrate karo yahan) |
| `attendance.checkin` | attendance-service | notification-service | Real-time "checked in" notification |
| `attendance.checkout` | attendance-service | notification-service | Real-time "checked out" notification |

Naya event add karna ho to bas: (1) publisher service me `publishEvent('naya.event', payload)`
call karo, (2) consumer service me apni queue ko us routing key se `bindQueue` karo.
# hr-microservice

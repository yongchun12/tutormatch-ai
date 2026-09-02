# TutorMatch AI

**TutorMatch AI** is a full-stack tuition centre directory system that helps Malaysian students and parents search for suitable tuition centres based on centre information, location, reviews, and recommendations.

The system includes separate interfaces for **students**, **tuition centre owners**, and **administrators**, allowing different users to access features based on their roles.

---

## Overview

TutorMatch AI provides a centralized platform for discovering and managing tuition centre information in Malaysia.

Users can browse tuition centres, view centre details, receive recommendations, and access role-based dashboards. Centre owners can manage their centre information, while administrators can manage users and tuition centre records.

The project also includes optional integrations such as Google Maps, Gemini AI, AWS S3, and SMTP email services. These features are designed to fail safely when not configured, allowing the application to run locally with seeded demo data.

---

## Tech Stack

| Area | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Backend | Next.js API Routes, Node.js |
| Database | MongoDB |
| Authentication | NextAuth |
| AI Integration | Gemini API |
| Maps and Location | Google Maps API / Places API |
| Storage | AWS S3 optional |
| Email | SMTP / Mailtrap optional |
| Data Collection | Crawler module |
| Package Manager | npm |

---

## Features

### Student

- Register and sign in
- Search and browse tuition centres
- View tuition centre details and reviews
- Receive tuition centre recommendations
- Access student dashboard

### Centre Owner

- Register and sign in
- Access owner dashboard
- Manage tuition centre profile
- Update centre information

### Administrator

- Access admin dashboard
- Manage users
- Manage tuition centre records
- Monitor platform data
- Trigger centre search or discovery workflows

### System Features

- Role-based access control
- Authentication with NextAuth
- Tuition centre search and filtering
- Recommendation system
- MongoDB database integration
- Optional Google Maps integration
- Optional Gemini AI-generated recommendation support
- Optional AWS S3 photo upload
- Optional SMTP email verification and password reset
- Seed script for demo accounts and sample data

---

## Setup Guide

### Requirements

| Requirement | Version / Notes |
|---|---|
| Node.js | 20.9 or newer |
| npm | 10 or newer |
| MongoDB | Atlas cluster or local server |
| Python | 3.9 or newer, optional for crawler |

Check your versions:

```shell
node -v
npm -v
```

---

### 1. Clone the Repository

```shell
git clone https://github.com/yongchun12/Tuition-Centre-Directory-System.git
cd Tuition-Centre-Directory-System
```

---

### 2. Install Dependencies

All commands should be run from the `web` folder.

```shell
cd web
npm install
```

---

### 3. Create Environment File

```shell
cp .env.example .env.local
```

For Windows Command Prompt:

```shell
copy .env.example .env.local
```

---

### 4. Configure Environment Variables

Open `web/.env.local` and fill in the minimum required values:

```ini
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net
MONGODB_DB=tutormatch_demo
NEXTAUTH_SECRET=<any long random string>
NEXTAUTH_URL=http://localhost:3000
```

Optional variables:

```ini
GOOGLE_MAPS_API_KEY=
GEMINI_API_KEY=
CRON_SECRET=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

---

### 5. Seed the Database

```shell
npm run seed
```

This creates demo accounts, sample tuition centres, and reviews.

> Note: This may clear existing users, centres, and reviews in the selected database. Use a fresh development database.

---

### 6. Run the Application

```shell
npm run dev
```

Open the application at:

```text
http://localhost:3000
```

To stop the server, press:

```text
Ctrl + C
```

---

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@tuition.com` | `password123` |
| Centre Owner | `owner@tuition.com` | `password123` |
| Student | `student@tuition.com` | `password123` |

Login page:

```text
http://localhost:3000/auth/login
```

---

## Main Pages

| Page | Route |
|---|---|
| Home / Search | `/` |
| Browse Centres | `/centres` |
| Recommendations | `/recommendations` |
| Student Dashboard | `/dashboard/student` |
| Owner Dashboard | `/dashboard/owner` |
| Admin Dashboard | `/dashboard/admin` |
| Login | `/auth/login` |
| Register | `/auth/register` |

---

## Crawler Module

The `crawler/` folder contains the crawler-assisted data collection module used to support tuition centre data discovery and preparation.

Python is only required if you want to run or modify the crawler.

---

## Author

Developed by **Jee Yong Chun**.

- LinkedIn: https://www.linkedin.com/in/jeeyongchun/
- GitHub: https://github.com/yongchun12

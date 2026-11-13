# IRONSTAGE – Gym Competition Management System

IRONSTAGE is a web-based platform for managing gym competitions, participant registrations and online payments. It provides an admin panel for managing competitions and a registration system for participants.

## Tech Stack

- **Frontend:** React.js, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** Supabase PostgreSQL
- **ORM:** Prisma
- **Authentication:** Supabase Auth
- **File Storage:** Supabase Storage
- **Payment Gateway:** Cashfree
- **Email Service:** Nodemailer, Gmail SMTP

## Features

- Secure admin login and role-based access.
- Create, edit, publish and manage competitions.
- Predefined categories based on competition type.
- Competition poster upload and management.
- Participant registration and profile management.
- Online payments through Cashfree.
- Payment verification using webhooks.
- Automated registration confirmation emails.
- Admin session timeout and API rate limiting.

## External Services

- **Supabase:** Database, authentication and file storage.
- **Cashfree:** Payment processing and webhook integration.
- **Gmail SMTP:** Registration confirmation emails.
- **Hosting:** Frontend and backend deployment.

## Project Structure
gym-competition-system/
├── frontend/
├── backend/
├── .gitignore
└── README.md

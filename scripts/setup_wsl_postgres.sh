#!/bin/bash
set -e

apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
service postgresql start

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='test_user'\" | grep -q 1 || psql -c \"CREATE USER test_user WITH PASSWORD 'test_password' SUPERUSER;\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='discovery_test'\" | grep -q 1 || psql -c \"CREATE DATABASE discovery_test OWNER test_user;\""

echo "POSTGRESQL_SETUP_COMPLETE"

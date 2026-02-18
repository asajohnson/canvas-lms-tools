# AWS Deployment Guide - Canvas SMS Web App

Complete guide to deploying the Canvas SMS web application on AWS.

## 🏗️ Architecture Overview

```
Internet Gateway
       ↓
Application Load Balancer (ALB)
       ↓
┌──────────────────────────────────────────────────┐
│  VPC (Virtual Private Cloud)                     │
│                                                  │
│  Public Subnets (2 AZs)                         │
│  ├─ NAT Gateway                                 │
│  └─ Bastion Host (optional)                     │
│                                                  │
│  Private Subnets (2 AZs)                        │
│  ├─ ECS Fargate                                 │
│  │  ├─ API Server (auto-scaling)               │
│  │  └─ Worker (scheduled tasks)                │
│  │                                              │
│  ├─ RDS PostgreSQL (Multi-AZ)                  │
│  │  └─ Read Replica (optional)                 │
│  │                                              │
│  └─ ElastiCache Redis (Cluster mode)           │
└──────────────────────────────────────────────────┘
       ↓
AWS Secrets Manager (credentials)
CloudWatch (logs & monitoring)
S3 (backups, static assets)
```

**Estimated Monthly Cost:**
- Small deployment (1-10 users): ~$50-100/month
- Medium deployment (10-50 users): ~$150-300/month
- Large deployment (50+ users): ~$300-500/month

---

## 📋 Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured
3. **Docker** installed locally
4. **Domain name** (optional but recommended)
5. **Twilio account** for SMS

---

## 🚀 Deployment Methods

### Method 1: AWS Copilot (Easiest - Recommended for Beginners)

AWS Copilot automates most of the infrastructure setup.

#### Step 1: Install AWS Copilot
```bash
# Windows (PowerShell)
Invoke-WebRequest -Uri "https://github.com/aws/copilot-cli/releases/latest/download/copilot-windows.exe" -OutFile "$env:LOCALAPPDATA\Microsoft\WindowsApps\copilot.exe"

# Verify installation
copilot --version
```

#### Step 2: Initialize Application
```bash
cd C:/Development/canvas-lms-tools/canvas-sms-web

# Initialize Copilot app
copilot app init canvas-sms-app

# Create environment (dev/staging/prod)
copilot env init --name production --region us-east-1 --profile default
```

#### Step 3: Create Services
```bash
# API Service (Load Balanced Web Service)
copilot svc init --name api \
  --svc-type "Load Balanced Web Service" \
  --dockerfile ./Dockerfile \
  --port 3000

# Worker Service (Backend Service)
copilot svc init --name worker \
  --svc-type "Backend Service" \
  --dockerfile ./Dockerfile.worker
```

#### Step 4: Add Database & Redis
Create `copilot/api/manifest.yml`:
```yaml
name: api
type: Load Balanced Web Service

image:
  build: Dockerfile
  port: 3000

cpu: 512
memory: 1024
count: 2

http:
  path: '/'
  healthcheck:
    path: /health
    healthy_threshold: 3
    interval: 15s

variables:
  NODE_ENV: production
  PORT: 3000
  LOG_LEVEL: info

secrets:
  DATABASE_URL: /canvas-sms/DATABASE_URL
  ENCRYPTION_MASTER_KEY: /canvas-sms/ENCRYPTION_MASTER_KEY
  JWT_SECRET: /canvas-sms/JWT_SECRET
  TWILIO_ACCOUNT_SID: /canvas-sms/TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN: /canvas-sms/TWILIO_AUTH_TOKEN
  TWILIO_PHONE_NUMBER: /canvas-sms/TWILIO_PHONE_NUMBER

storage:
  volumes:
    logs:
      path: /app/logs
      read_only: false

environments:
  production:
    count:
      range: 2-10
      cpu_percentage: 70
```

#### Step 5: Deploy
```bash
# Deploy to production
copilot deploy --name api --env production

# Deploy worker
copilot deploy --name worker --env production
```

---

### Method 2: Manual Setup (Full Control)

For production deployments with custom requirements.

## Step-by-Step Manual Deployment

### 1️⃣ Set Up VPC & Networking

```bash
# Create VPC
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=canvas-sms-vpc}]'

# Create subnets (2 public, 2 private across 2 AZs)
# Public Subnet 1 (us-east-1a)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a

# Public Subnet 2 (us-east-1b)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b

# Private Subnet 1 (us-east-1a)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.3.0/24 \
  --availability-zone us-east-1a

# Private Subnet 2 (us-east-1b)
aws ec2 create-subnet \
  --vpc-id vpc-xxxxx \
  --cidr-block 10.0.4.0/24 \
  --availability-zone us-east-1b

# Create Internet Gateway
aws ec2 create-internet-gateway

# Attach to VPC
aws ec2 attach-internet-gateway \
  --vpc-id vpc-xxxxx \
  --internet-gateway-id igw-xxxxx

# Create NAT Gateway (for private subnets to access internet)
aws ec2 create-nat-gateway \
  --subnet-id subnet-xxxxx \
  --allocation-id eipalloc-xxxxx
```

### 2️⃣ Create RDS PostgreSQL Database

```bash
# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name canvas-sms-db-subnet \
  --db-subnet-group-description "Canvas SMS DB Subnet Group" \
  --subnet-ids subnet-xxxxx subnet-xxxxx

# Create PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier canvas-sms-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username canvas_admin \
  --master-user-password 'YOUR_SECURE_PASSWORD' \
  --allocated-storage 20 \
  --storage-type gp3 \
  --storage-encrypted \
  --db-subnet-group-name canvas-sms-db-subnet \
  --vpc-security-group-ids sg-xxxxx \
  --backup-retention-period 7 \
  --multi-az \
  --publicly-accessible false \
  --tags Key=Name,Value=canvas-sms-postgres
```

### 3️⃣ Create ElastiCache Redis Cluster

```bash
# Create Redis subnet group
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name canvas-sms-redis-subnet \
  --cache-subnet-group-description "Canvas SMS Redis Subnet" \
  --subnet-ids subnet-xxxxx subnet-xxxxx

# Create Redis cluster
aws elasticache create-replication-group \
  --replication-group-id canvas-sms-redis \
  --replication-group-description "Canvas SMS Redis Cluster" \
  --engine redis \
  --engine-version 7.0 \
  --cache-node-type cache.t3.micro \
  --num-cache-clusters 2 \
  --automatic-failover-enabled \
  --multi-az-enabled \
  --cache-subnet-group-name canvas-sms-redis-subnet \
  --security-group-ids sg-xxxxx \
  --at-rest-encryption-enabled \
  --transit-encryption-enabled
```

### 4️⃣ Store Secrets in AWS Secrets Manager

```bash
# Create encryption key secret
aws secretsmanager create-secret \
  --name /canvas-sms/ENCRYPTION_MASTER_KEY \
  --secret-string "ff72cf83c1b77c9c76137b6648520454fdc4995553a88979e88781905660467a"

# Create JWT secret
aws secretsmanager create-secret \
  --name /canvas-sms/JWT_SECRET \
  --secret-string "pXUNemmuyWzMh4nHuawNGPA25ViRyF3R7caAjfMpvo8="

# Create database URL
aws secretsmanager create-secret \
  --name /canvas-sms/DATABASE_URL \
  --secret-string "postgresql://canvas_admin:PASSWORD@canvas-sms-db.xxxxx.us-east-1.rds.amazonaws.com:5432/canvas_sms"

# Create Twilio credentials
aws secretsmanager create-secret \
  --name /canvas-sms/TWILIO_ACCOUNT_SID \
  --secret-string "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

aws secretsmanager create-secret \
  --name /canvas-sms/TWILIO_AUTH_TOKEN \
  --secret-string "your_auth_token"

aws secretsmanager create-secret \
  --name /canvas-sms/TWILIO_PHONE_NUMBER \
  --secret-string "+15551234567"
```

### 5️⃣ Build & Push Docker Images to ECR

```bash
# Create ECR repositories
aws ecr create-repository --repository-name canvas-sms/api
aws ecr create-repository --repository-name canvas-sms/worker

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build images locally
cd C:/Development/canvas-lms-tools/canvas-sms-web

# Build API image
docker build -t canvas-sms/api:latest -f Dockerfile .

# Build worker image
docker build -t canvas-sms/worker:latest -f Dockerfile.worker .

# Tag images
docker tag canvas-sms/api:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/canvas-sms/api:latest
docker tag canvas-sms/worker:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/canvas-sms/worker:latest

# Push images
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/canvas-sms/api:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/canvas-sms/worker:latest
```

### 6️⃣ Create ECS Cluster & Task Definitions

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name canvas-sms-cluster

# Create task execution role (if not exists)
# See task-execution-role.json below

# Register API task definition
aws ecs register-task-definition --cli-input-json file://ecs-api-task.json

# Register worker task definition
aws ecs register-task-definition --cli-input-json file://ecs-worker-task.json
```

**ecs-api-task.json:**
```json
{
  "family": "canvas-sms-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/canvas-sms/api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "LOG_LEVEL", "value": "info" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:/canvas-sms/DATABASE_URL"
        },
        {
          "name": "ENCRYPTION_MASTER_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:/canvas-sms/ENCRYPTION_MASTER_KEY"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:/canvas-sms/JWT_SECRET"
        },
        {
          "name": "TWILIO_ACCOUNT_SID",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:/canvas-sms/TWILIO_ACCOUNT_SID"
        },
        {
          "name": "TWILIO_AUTH_TOKEN",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:/canvas-sms/TWILIO_AUTH_TOKEN"
        },
        {
          "name": "TWILIO_PHONE_NUMBER",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:YOUR_ACCOUNT_ID:secret:/canvas-sms/TWILIO_PHONE_NUMBER"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/canvas-sms-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "api"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

### 7️⃣ Create Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name canvas-sms-alb \
  --subnets subnet-xxxxx subnet-xxxxx \
  --security-groups sg-xxxxx \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4

# Create target group
aws elbv2 create-target-group \
  --name canvas-sms-api-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30

# Create listener (HTTP - redirect to HTTPS in production)
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:... \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...
```

### 8️⃣ Create ECS Services

```bash
# Create API service
aws ecs create-service \
  --cluster canvas-sms-cluster \
  --service-name canvas-sms-api-service \
  --task-definition canvas-sms-api:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=api,containerPort=3000

# Create worker service
aws ecs create-service \
  --cluster canvas-sms-cluster \
  --service-name canvas-sms-worker-service \
  --task-definition canvas-sms-worker:1 \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx,subnet-xxxxx],securityGroups=[sg-xxxxx],assignPublicIp=DISABLED}"
```

### 9️⃣ Run Database Migrations

```bash
# Option 1: Use ECS Task (recommended)
aws ecs run-task \
  --cluster canvas-sms-cluster \
  --task-definition canvas-sms-api:1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[sg-xxxxx]}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["npm","run","prisma:migrate"]}]}'

# Option 2: Connect via bastion host
ssh -i key.pem ec2-user@bastion-host
# Then run migrations from bastion
```

### 🔟 Set Up Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/canvas-sms-cluster/canvas-sms-api-service \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/canvas-sms-cluster/canvas-sms-api-service \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy.json
```

**scaling-policy.json:**
```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleInCooldown": 300,
  "ScaleOutCooldown": 60
}
```

---

## 📊 Monitoring & Logging

### CloudWatch Logs
```bash
# Create log groups
aws logs create-log-group --log-group-name /ecs/canvas-sms-api
aws logs create-log-group --log-group-name /ecs/canvas-sms-worker

# Set retention (7 days)
aws logs put-retention-policy \
  --log-group-name /ecs/canvas-sms-api \
  --retention-in-days 7
```

### CloudWatch Alarms
```bash
# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name canvas-sms-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Database connections alarm
aws cloudwatch put-metric-alarm \
  --alarm-name canvas-sms-db-connections \
  --alarm-description "Alert when DB connections high" \
  --metric-name DatabaseConnections \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔒 Security Best Practices

### 1. VPC Security Groups

**API Security Group:**
- Inbound: 3000 from ALB security group
- Outbound: All traffic

**Database Security Group:**
- Inbound: 5432 from ECS security group
- Outbound: None

**Redis Security Group:**
- Inbound: 6379 from ECS security group
- Outbound: None

### 2. IAM Roles

**ECS Task Execution Role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}
```

**ECS Task Role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:/canvas-sms/*"
    }
  ]
}
```

### 3. Enable WAF (Web Application Firewall)

```bash
# Create WAF Web ACL
aws wafv2 create-web-acl \
  --name canvas-sms-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://waf-rules.json

# Associate with ALB
aws wafv2 associate-web-acl \
  --web-acl-arn arn:aws:wafv2:... \
  --resource-arn arn:aws:elasticloadbalancing:...
```

---

## 💰 Cost Optimization

### 1. Use Spot Instances for Worker
```json
{
  "capacityProviders": ["FARGATE_SPOT"],
  "launchType": "FARGATE_SPOT",
  "platformVersion": "LATEST"
}
```

### 2. Enable RDS Auto Scaling
```bash
aws rds modify-db-instance \
  --db-instance-identifier canvas-sms-db \
  --max-allocated-storage 100
```

### 3. Use Reserved Capacity
- Reserve RDS instance for 1-3 years (up to 60% savings)
- Purchase Savings Plans for ECS Fargate

### 4. Set Up S3 Lifecycle Policies
```bash
# Move old logs to Glacier after 30 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket canvas-sms-logs \
  --lifecycle-configuration file://lifecycle.json
```

---

## 🚨 Disaster Recovery

### Automated Backups
```bash
# Enable automated RDS backups (already enabled)
aws rds modify-db-instance \
  --db-instance-identifier canvas-sms-db \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00"

# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier canvas-sms-db \
  --db-snapshot-identifier canvas-sms-manual-snapshot-$(date +%Y%m%d)
```

### Cross-Region Replication
```bash
# Create read replica in different region
aws rds create-db-instance-read-replica \
  --db-instance-identifier canvas-sms-db-replica \
  --source-db-instance-identifier arn:aws:rds:us-east-1:...:db:canvas-sms-db \
  --region us-west-2
```

---

## 📈 Monitoring Dashboard

### Create CloudWatch Dashboard
```bash
aws cloudwatch put-dashboard \
  --dashboard-name canvas-sms-dashboard \
  --dashboard-body file://dashboard.json
```

**dashboard.json:**
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
          [".", "MemoryUtilization", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ECS Resource Usage"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/RDS", "DatabaseConnections"],
          [".", "CPUUtilization"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "RDS Metrics"
      }
    }
  ]
}
```

---

## ✅ Deployment Checklist

- [ ] VPC and subnets created
- [ ] Security groups configured
- [ ] RDS PostgreSQL created and accessible
- [ ] ElastiCache Redis created
- [ ] Secrets stored in Secrets Manager
- [ ] Docker images built and pushed to ECR
- [ ] ECS cluster created
- [ ] Task definitions registered
- [ ] ALB configured with target groups
- [ ] ECS services running
- [ ] Database migrations completed
- [ ] Auto-scaling configured
- [ ] CloudWatch logs enabled
- [ ] CloudWatch alarms set up
- [ ] WAF enabled (optional)
- [ ] Domain name configured (optional)
- [ ] SSL certificate installed (optional)
- [ ] Backup strategy in place
- [ ] Cost monitoring enabled

---

## 🔗 Useful AWS CLI Commands

```bash
# Check service status
aws ecs describe-services --cluster canvas-sms-cluster --services canvas-sms-api-service

# View logs
aws logs tail /ecs/canvas-sms-api --follow

# Update service (deploy new image)
aws ecs update-service \
  --cluster canvas-sms-cluster \
  --service canvas-sms-api-service \
  --force-new-deployment

# Scale service manually
aws ecs update-service \
  --cluster canvas-sms-cluster \
  --service canvas-sms-api-service \
  --desired-count 5

# Check task status
aws ecs list-tasks --cluster canvas-sms-cluster

# Execute command in running container
aws ecs execute-command \
  --cluster canvas-sms-cluster \
  --task task-id \
  --container api \
  --interactive \
  --command "/bin/bash"
```

---

## 📞 Support & Troubleshooting

### Common Issues

**1. Tasks won't start:**
- Check security groups allow traffic
- Verify secrets exist in Secrets Manager
- Check CloudWatch logs for errors

**2. Can't connect to database:**
- Verify RDS security group allows ECS
- Check DATABASE_URL format
- Ensure NAT Gateway is working

**3. Redis connection failed:**
- Check ElastiCache security group
- Verify Redis endpoint in environment
- Check if encryption is enabled

**4. High costs:**
- Review CloudWatch cost explorer
- Check for idle resources
- Enable auto-scaling
- Use Spot instances for workers

---

**Total deployment time:** 2-4 hours (manual) or 30 minutes (AWS Copilot)

**Recommended approach:** Start with AWS Copilot, then customize as needed.

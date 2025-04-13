Deploy to GCP

Check health of the app

```bash
curl http://localhost:4000/health
```

Build Docker Image

```bash
docker build -t my-nodejs-app .
```

Tag Docker Image
ProjectId: able-source-456701-k8

```bash
docker tag my-nodejs-app asia-southeast1-docker.pkg.dev/able-source-456701-k8/my-nodejs-app/my-nodejs-app:latest
```

Push Docker Image to GCP Artifact Registry

```bash
docker push asia-southeast1-docker.pkg.dev/able-source-456701-k8/my-nodejs-app/my-nodejs-app:latest
```

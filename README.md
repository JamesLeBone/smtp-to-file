# smtp-to-file
SMTP Service that logs the file to the filesystem.  An API is provided to manage sent emails.

# Instructions

## Build
`docker build -t smtp2file .`

This builds the container as "smtp2file" rename it as you wish.

## Run

```
-d = detached (runs in background)
--name smtp2file = container name
-p 25:25 = publish port mapping
-v ${PWD}/inbox:/app/inbox = volume mount for persistent storage
```

`docker run --name smtp2file -p 8085:8085 -p 25:25 -v ${PWD}/inbox:/app/inbox smtp2file`
This wil run it on port 25 (insecure SMTP)
It will also retain the inbox on disk.

# Updating the code in docker

## Formal Rebuild

### Stop and remove the old container
docker stop smtp2file
docker rm smtp2file

### Rebuild the image with your updated code
docker build -t smtp2file .

### Run the new container
docker run -p 8085:8085 -p 25:25 --name smtp2file -v ${PWD}/inbox:/app/inbox smtp2file

## Shortcut (mounts the local fs)

docker stop smtp2file
docker rm smtp2file
docker build -t smtp2file .
docker run -p 8085:8085 -p 25:25 --name smtp2file -v ${PWD}/inbox:/app/inbox smtp2file

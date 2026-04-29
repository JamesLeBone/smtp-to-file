FROM node:22-slim

WORKDIR /app

# Install dependencies first for reproducible image builds

# Copy package files
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Create inbox directory
RUN mkdir -p inbox

# Expose SMTP port
EXPOSE 25
EXPOSE 8085

CMD ["npm", "run", "start"]

#CMD ["bash"]

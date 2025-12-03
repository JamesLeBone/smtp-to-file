FROM node:latest

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Create inbox directory
RUN mkdir -p inbox

# Expose SMTP port
EXPOSE 25
EXPOSE 8085

# Start the application
CMD ["npm", "run", "start"]



FROM node:latest
MAINTAINER Nick Goldstein <nick@nickgoldstein.com>
WORKDIR /opt/ppbot/
RUN npm install
RUN apt-get update && apt-get install -y \
    p7zip \
    p7zip-full
CMD npm start

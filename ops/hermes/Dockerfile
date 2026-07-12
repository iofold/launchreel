FROM nousresearch/hermes-agent:latest

ARG HERMES_UID=1000
ARG HERMES_GID=1000

USER root

RUN groupmod -o -g "${HERMES_GID}" hermes \
    && usermod -o -u "${HERMES_UID}" -g "${HERMES_GID}" hermes \
    && chown -R hermes:hermes /opt/hermes /opt/data

USER hermes

RUN cd /opt/hermes/web \
    && npm install --silent \
    && npm run build

USER root
ENV HERMES_WEB_DIST=/opt/hermes/hermes_cli/web_dist
USER hermes

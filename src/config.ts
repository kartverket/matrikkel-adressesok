const hostList = Bun.env.ELS_ADRESSER_HOSTS
    ?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);

if (hostList == undefined) {
  throw new Error('Could not find ELS_ADRESSER_HOSTS')
}

export const config = {
  elasticsearch: {
    nodes: hostList,
    username: Bun.env.ELS_ADRESSER_USERNAME,
    password: Bun.env.ELS_ADRESSER_PASSWORD,
    index: Bun.env.ELS_ADRESSER_INDEX ?? "adressesok",
    requestTimeout: Number(Bun.env.ELS_ADRESSER_TIMEOUT_MS ?? 20_000)
  },
  defaultSrid: 4258,
  port: Number(Bun.env.PORT ?? 3000),
  logLevel: Bun.env.ADRESSER_API_LOG_LEVEL ?? "error"
} as const;

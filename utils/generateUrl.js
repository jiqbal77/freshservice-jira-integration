export const generateUrl = (domainPrefix) => {
    let domain = process.env.FRESHSERVICE_URL
    return domain.replace('domain', domainPrefix)
}

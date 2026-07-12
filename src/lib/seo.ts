import { businessConfig } from '../config/business';

export function buildSeo(title: string, description = businessConfig.seo.defaultDescription, pathname = '/') {
  const url = new URL(pathname, businessConfig.siteUrl).toString();

  return {
    title: businessConfig.seo.titleTemplate.replace('%s', title),
    description,
    url,
    image: businessConfig.seo.defaultOgImage
  };
}

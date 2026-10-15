const JSON_MEDIA_TYPE = 'application/json';

const HEADER_ACCESS_TOKEN = 'Access-Token';
const HEADER_CONTENT_TYPE = 'Content-Type';

const buildTokenizationHeaders = ({ accessToken }) => {
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('accessToken is required');
  }
  return {
    [HEADER_ACCESS_TOKEN]: accessToken,
    [HEADER_CONTENT_TYPE]: JSON_MEDIA_TYPE,
  };
};

module.exports = {
  JSON_MEDIA_TYPE,
  HEADER_ACCESS_TOKEN,
  HEADER_CONTENT_TYPE,
  buildTokenizationHeaders,
};

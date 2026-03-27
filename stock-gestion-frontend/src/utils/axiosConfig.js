import axios from 'axios';

let requestCount = 0;

const setupAxiosInterceptors = (setIsApiLoading) => {
  // Intercepteur de requête
  axios.interceptors.request.use(
    (config) => {
      requestCount++;
      setIsApiLoading(true);
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Intercepteur de réponse
  axios.interceptors.response.use(
    (response) => { requestCount--; if (requestCount === 0) setIsApiLoading(false); return response; },
    (error) => { requestCount--; if (requestCount === 0) setIsApiLoading(false); return Promise.reject(error); }
  );
};

export default setupAxiosInterceptors;
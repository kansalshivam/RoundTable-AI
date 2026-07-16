FROM python:3.11-slim
WORKDIR /dsp_service
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libsndfile1 && rm -rf /var/lib/apt/lists/*
COPY dsp_service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY dsp_service ./
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

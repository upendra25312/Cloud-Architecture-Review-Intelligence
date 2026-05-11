# CARI Office Renderer

Containerized Office/PDF-to-PNG renderer for CARI ARB visual evidence extraction.

The CARI API calls this service for Office native-shape fallback cases, such as PowerPoint SmartArt, charts, native drawing shapes, Word pages, or Excel sheets that are not stored as embedded media files. It also renders selected PDF pages when Document Intelligence does not return usable cropped figure images.

## Runtime contract

- `GET /health`
- `POST /render`

`POST /render` requires `x-cari-renderer-token` when `RENDERER_SHARED_SECRET` is configured.

```json
{
  "fileName": "architecture.pptx",
  "fileBase64": "<base64 Office file>",
  "maxPages": 20,
  "startPage": 1,
  "endPage": 20
}
```

The response returns rendered PNGs as base64 so the API can persist them in the existing `arb-outputfiles` container and analyze them with `describeImageForReview()`.

## Budget controls

- Container Apps Consumption
- `minReplicas = 0`
- `maxReplicas = 1`
- `0.5 vCPU`
- `1Gi memory`
- max file size `50 MB`
- max rendered pages/slides/sheets `20`
- render timeout `120 seconds`

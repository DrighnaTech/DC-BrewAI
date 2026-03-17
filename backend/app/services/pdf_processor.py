"""
PDF processor for OCR pipeline.

Uses PyMuPDF (fitz) to:
  1. Extract text directly from digital PDFs (fast, accurate)
  2. Convert pages to images for OCR only when native text extraction fails (scanned PDFs)
"""

import base64

import fitz  # PyMuPDF
import structlog

log = structlog.get_logger()

# Max pages to process (prevents memory issues with huge PDFs)
MAX_PAGES = 20
# DPI for rendering (higher = better OCR accuracy, more memory)
RENDER_DPI = 200
# Minimum chars per page to consider text extraction successful
MIN_TEXT_CHARS = 20


def pdf_extract_text(pdf_bytes: bytes, max_pages: int = MAX_PAGES) -> str | None:
    """
    Try to extract text directly from a digital PDF using PyMuPDF.
    Returns combined text if successful, None if the PDF is scanned/image-only.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages)

        all_text: list[str] = []
        pages_with_text = 0

        for page_num in range(pages_to_process):
            page = doc[page_num]
            text = page.get_text().strip()
            if len(text) >= MIN_TEXT_CHARS:
                pages_with_text += 1
            if pages_to_process > 1:
                all_text.append(f"--- Page {page_num + 1} ---\n{text}")
            else:
                all_text.append(text)

        doc.close()

        # If most pages have text, it's a digital PDF — use native extraction
        if pages_with_text >= pages_to_process * 0.5:
            combined = "\n\n".join(all_text)
            log.info(
                "pdf_native_text_extracted",
                total_pages=total_pages,
                pages_with_text=pages_with_text,
                text_length=len(combined),
            )
            return combined

        log.info(
            "pdf_native_text_insufficient",
            total_pages=total_pages,
            pages_with_text=pages_with_text,
            fallback="ocr",
        )
        return None

    except Exception as e:
        log.warning("pdf_native_extract_failed", error=str(e))
        return None


def pdf_bytes_to_images(pdf_bytes: bytes, max_pages: int = MAX_PAGES) -> list[str]:
    """
    Convert a PDF file (as bytes) into a list of base64-encoded PNG images.
    Used as fallback when native text extraction fails (scanned/image PDFs).

    Args:
        pdf_bytes: Raw PDF file content.
        max_pages: Maximum number of pages to process.

    Returns:
        List of base64-encoded PNG strings (one per page).
    """
    images: list[str] = []

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages)

        log.info(
            "pdf_to_images",
            total_pages=total_pages,
            processing=pages_to_process,
        )

        zoom = RENDER_DPI / 72  # 72 is default PDF DPI
        matrix = fitz.Matrix(zoom, zoom)

        for page_num in range(pages_to_process):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=matrix)
            png_bytes = pix.tobytes("png")
            b64 = base64.b64encode(png_bytes).decode("utf-8")
            images.append(b64)

        doc.close()
        log.info("pdf_to_images_done", pages=len(images))

    except Exception as e:
        log.error("pdf_to_images_failed", error=str(e))
        raise ValueError(f"Failed to process PDF: {str(e)}")

    return images


def is_pdf(content_type: str | None, filename: str | None = None) -> bool:
    """Check if a file is a PDF based on content type or filename."""
    if content_type and content_type == "application/pdf":
        return True
    if filename and filename.lower().endswith(".pdf"):
        return True
    return False

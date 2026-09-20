from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
from PIL import Image
import io
import math


# ============================================================
# AEROCUE AI BACKEND
# OVERLAPPING 3x3 TILED PERSON DETECTION
# ============================================================

app = FastAPI(
    title="AeroCue AI Backend",
    version="3.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# YOLO MODEL
# ============================================================

model = YOLO("yolo11n.pt")


# ============================================================
# AI CONFIGURATION
# ============================================================

GRID_SIZE = 3

# Percentage of overlap between neighboring tiles
OVERLAP = 0.25

# Lower threshold helps with small/distant people
CONFIDENCE_THRESHOLD = 0.2

# YOLO inference resolution
INFERENCE_SIZE = 1280

# Duplicate detection threshold
IOU_THRESHOLD = 0.45


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "system": "AeroCue AI Backend",
        "status": "ONLINE",
        "model": "YOLO11n",
        "mode": "OVERLAPPING 3x3 TILED DETECTION",
        "overlap": OVERLAP,
        "confidenceThreshold": CONFIDENCE_THRESHOLD,
        "inferenceSize": INFERENCE_SIZE,
    }


# ============================================================
# IOU
# ============================================================

def calculate_iou(box_a, box_b):

    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    intersection_x1 = max(ax1, bx1)
    intersection_y1 = max(ay1, by1)

    intersection_x2 = min(ax2, bx2)
    intersection_y2 = min(ay2, by2)

    intersection_width = max(
        0,
        intersection_x2 - intersection_x1
    )

    intersection_height = max(
        0,
        intersection_y2 - intersection_y1
    )

    intersection_area = (
        intersection_width *
        intersection_height
    )

    area_a = (
        max(0, ax2 - ax1) *
        max(0, ay2 - ay1)
    )

    area_b = (
        max(0, bx2 - bx1) *
        max(0, by2 - by1)
    )

    union_area = (
        area_a +
        area_b -
        intersection_area
    )

    if union_area <= 0:
        return 0

    return intersection_area / union_area


# ============================================================
# REMOVE DUPLICATE DETECTIONS
# ============================================================

def remove_duplicate_detections(
    detections,
    iou_threshold=IOU_THRESHOLD
):

    if not detections:
        return []

    # Highest confidence first
    detections = sorted(
        detections,
        key=lambda detection:
            detection["confidence"],
        reverse=True
    )

    final_detections = []

    for detection in detections:

        is_duplicate = False

        for accepted in final_detections:

            iou = calculate_iou(
                detection["bbox"],
                accepted["bbox"]
            )

            if iou >= iou_threshold:

                is_duplicate = True
                break

        if not is_duplicate:

            final_detections.append(
                detection
            )

    return final_detections


# ============================================================
# GENERATE OVERLAPPING TILE POSITIONS
# ============================================================

def generate_tile_positions(
    image_width,
    image_height
):

    # --------------------------------------------------------
    # Calculate tile size.
    #
    # With 3 tiles and 25% overlap:
    #
    #  ┌───────────────┐
    #  │      TILE 1   │
    #  │         ┌───────────────┐
    #  │         │    TILE 2     │
    #  │         │         ┌───────────────┐
    #  │         │         │    TILE 3     │
    #  └─────────┴─────────┴───────────────┘
    # --------------------------------------------------------

    effective_grid = (
        1 +
        (GRID_SIZE - 1) *
        (1 - OVERLAP)
    )

    tile_width = math.ceil(
        image_width / effective_grid
    )

    tile_height = math.ceil(
        image_height / effective_grid
    )

    stride_x = math.floor(
        tile_width *
        (1 - OVERLAP)
    )

    stride_y = math.floor(
        tile_height *
        (1 - OVERLAP)
    )

    stride_x = max(1, stride_x)
    stride_y = max(1, stride_y)

    positions = []

    for row in range(GRID_SIZE):

        for column in range(GRID_SIZE):

            # ------------------------------------------------
            # Calculate starting coordinates
            # ------------------------------------------------

            x = column * stride_x
            y = row * stride_y

            # ------------------------------------------------
            # Make sure the tile stays inside image
            # ------------------------------------------------

            if x + tile_width > image_width:

                x = image_width - tile_width

            if y + tile_height > image_height:

                y = image_height - tile_height

            x = max(0, x)
            y = max(0, y)

            positions.append({
                "row": row,
                "column": column,
                "x": x,
                "y": y,
                "width": min(
                    tile_width,
                    image_width
                ),
                "height": min(
                    tile_height,
                    image_height
                ),
            })

    return positions


# ============================================================
# ANALYZE IMAGE
# ============================================================

@app.post("/analyze")
async def analyze_image(
    file: UploadFile = File(...)
):

    # ========================================================
    # READ IMAGE
    # ========================================================

    image_bytes = await file.read()

    image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("RGB")

    image_width, image_height = image.size


    # ========================================================
    # CREATE OVERLAPPING TILES
    # ========================================================

    tile_positions = generate_tile_positions(
        image_width,
        image_height
    )


    all_detections = []

    tile_results = []


    # ========================================================
    # ANALYZE EACH TILE
    # ========================================================

    for tile_number, tile_info in enumerate(
        tile_positions,
        start=1
    ):

        left = tile_info["x"]
        top = tile_info["y"]

        right = min(
            left + tile_info["width"],
            image_width
        )

        bottom = min(
            top + tile_info["height"],
            image_height
        )


        # ----------------------------------------------------
        # Crop tile
        # ----------------------------------------------------

        tile = image.crop(
            (
                left,
                top,
                right,
                bottom
            )
        )


        tile_id = (
            f"TILE-{tile_number:02d}"
        )


        # ----------------------------------------------------
        # Run YOLO
        # ----------------------------------------------------

        results = model(
            tile,
            imgsz=INFERENCE_SIZE,
            conf=CONFIDENCE_THRESHOLD,
            verbose=False
        )


        tile_detections = []


        # ----------------------------------------------------
        # Process detections
        # ----------------------------------------------------

        for result in results:

            for box in result.boxes:

                class_id = int(
                    box.cls[0]
                )

                class_name = model.names[
                    class_id
                ]


                # Only detect people
                if class_name.lower() != "person":

                    continue


                confidence = float(
                    box.conf[0]
                )


                # ------------------------------------------------
                # Bounding box relative to tile
                # ------------------------------------------------

                x1, y1, x2, y2 = [
                    float(value)
                    for value in box.xyxy[0]
                ]


                # ------------------------------------------------
                # Convert tile coordinates
                # to original image coordinates
                # ------------------------------------------------

                original_x1 = x1 + left
                original_y1 = y1 + top

                original_x2 = x2 + left
                original_y2 = y2 + top


                detection = {

                    "class": "person",

                    "confidence": round(
                        confidence * 100,
                        2
                    ),

                    "bbox": [
                        round(
                            original_x1,
                            2
                        ),
                        round(
                            original_y1,
                            2
                        ),
                        round(
                            original_x2,
                            2
                        ),
                        round(
                            original_y2,
                            2
                        ),
                    ],

                    "tile": tile_id,

                }


                all_detections.append(
                    detection
                )

                tile_detections.append(
                    detection
                )


        # ----------------------------------------------------
        # Save tile statistics
        # ----------------------------------------------------

        tile_results.append({

            "tile": tile_id,

            "row":
                tile_info["row"],

            "column":
                tile_info["column"],

            "x":
                left,

            "y":
                top,

            "width":
                right - left,

            "height":
                bottom - top,

            "personCount":
                len(tile_detections),

            "detections":
                tile_detections,

        })


    # ========================================================
    # REMOVE DUPLICATES
    # ========================================================

    final_detections = (
        remove_duplicate_detections(
            all_detections
        )
    )


    # ========================================================
    # SORT DETECTIONS
    # ========================================================

    final_detections.sort(
        key=lambda detection: (
            detection["bbox"][1],
            detection["bbox"][0]
        )
    )


    # ========================================================
    # GIVE FINAL DETECTIONS UNIQUE IDs
    # ========================================================

    for index, detection in enumerate(
        final_detections,
        start=1
    ):

        detection["id"] = (
            f"PERSON-{index:02d}"
        )


    # ========================================================
    # FINAL RESPONSE
    # ========================================================

    return {

        "success": True,

        "mode":
            "OVERLAPPING 3x3 TILED DETECTION",

        "imageWidth":
            image_width,

        "imageHeight":
            image_height,

        "tilesAnalyzed":
            len(tile_positions),

        "overlap":
            OVERLAP,

        "confidenceThreshold":
            CONFIDENCE_THRESHOLD,

        "inferenceSize":
            INFERENCE_SIZE,

        "rawDetectionCount":
            len(all_detections),

        "personCount":
            len(final_detections),

        "detections":
            final_detections,

        "tiles":
            tile_results,

    }
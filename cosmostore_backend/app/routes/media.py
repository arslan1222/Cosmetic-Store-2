from flask import Blueprint, Response, abort

from app.models import StoredImage

media_bp = Blueprint("media", __name__, url_prefix="/api")


@media_bp.route("/media/<path:filename>", methods=["GET"])
def serve_media(filename):
    """Serve an image stored in the database (public, cached by browsers)."""
    image = StoredImage.query.filter_by(filename=filename).first()
    if image is None:
        abort(404)
    response = Response(image.data, mimetype=image.mimetype)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

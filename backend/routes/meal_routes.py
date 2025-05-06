from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from datetime import datetime, timedelta
from config import mongo
from utils.auth import token_required
from utils.error_handler import api_error_handler
import logging

logger = logging.getLogger(__name__)
meal_bp = Blueprint('meal_routes', __name__)

@meal_bp.route('/api/meals-only', methods=['GET'])
@token_required
@api_error_handler
def get_meals_only(current_user):
    try:
        # Parse query parameters
        limit = int(request.args.get('limit', 10))
        skip = int(request.args.get('skip', 0))
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        filter_by = request.args.get('filter_by', 'timestamp')

        # Determine user ID (allow doctors to view patient data)
        patient_id = request.args.get('patient_id')
        if patient_id and current_user.get('user_type') != 'doctor':
            return jsonify({"error": "Unauthorized to view patient data"}), 403

        user_id = patient_id if patient_id else str(current_user['_id'])

        # Base query - always filter by user
        query = {"user_id": user_id}

        # Handle filtering based on time parameters
        if start_date_str or end_date_str:
            # Parse the provided time parameters
            start_datetime = None
            end_datetime = None

            if start_date_str:
                try:
                    start_datetime = datetime.strptime(start_date_str, '%Y-%m-%d')
                    logger.debug(f"Using start date: {start_datetime}")
                except Exception as e:
                    logger.error(f"Error parsing start date '{start_date_str}': {e}")
                    return jsonify({"error": f"Invalid start_date format: {start_date_str}"}), 400

            if end_date_str:
                try:
                    # Add one day to include full end date
                    end_datetime = datetime.strptime(end_date_str, '%Y-%m-%d') + timedelta(days=1)
                    logger.debug(f"Using end date: {end_datetime}")
                except Exception as e:
                    logger.error(f"Error parsing end date '{end_date_str}': {e}")
                    return jsonify({"error": f"Invalid end_date format: {end_date_str}"}), 400

            # Add date range to query
            time_filter = {}
            if start_datetime:
                time_filter["$gte"] = start_datetime
            if end_datetime:
                time_filter["$lt"] = end_datetime

            if time_filter:
                query[filter_by] = time_filter

        # Get total count for pagination
        total_meals = mongo.db.meals_only.count_documents(query)

        # Execute the query with pagination
        meals = list(mongo.db.meals_only.find(query).sort("timestamp", -1).skip(skip).limit(limit))

        # Format results
        formatted_meals = []
        for meal in meals:
            formatted_meal = {
                "id": str(meal["_id"]),
                "timestamp": meal["timestamp"].isoformat(),
                "mealType": meal.get("mealType", "normal"),
                "foodItems": meal.get("foodItems", []),
                "nutrition": meal.get("nutrition", {}),
                "notes": meal.get("notes", "")
            }

            # Include calculation summary if present
            if "calculation_summary" in meal:
                formatted_meal["calculation_summary"] = meal["calculation_summary"]

            # Include related IDs if present
            if "meal_id" in meal:
                formatted_meal["meal_id"] = meal["meal_id"]

            formatted_meals.append(formatted_meal)

        return jsonify({
            "meals": formatted_meals,
            "pagination": {
                "total": total_meals,
                "limit": limit,
                "skip": skip
            }
        }), 200

    except Exception as e:
        logger.error(f"Error retrieving meals-only data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@meal_bp.route('/api/patient/<patient_id>/meals-only', methods=['GET'])
@token_required
@api_error_handler
def get_patient_meals_only(current_user, patient_id):
    # Check if the current user is a doctor
    if current_user.get('user_type') != 'doctor':
        return jsonify({"error": "Unauthorized access"}), 403

    try:
        # Parse query parameters
        limit = int(request.args.get('limit', 10))
        skip = int(request.args.get('skip', 0))
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        filter_by = request.args.get('filter_by', 'timestamp')

        # Base query - filter by patient
        query = {"user_id": patient_id}

        # Handle filtering based on time parameters
        if start_date_str or end_date_str:
            # Parse the provided time parameters
            start_datetime = None
            end_datetime = None

            if start_date_str:
                try:
                    start_datetime = datetime.strptime(start_date_str, '%Y-%m-%d')
                except Exception as e:
                    logger.error(f"Error parsing start date '{start_date_str}': {e}")
                    return jsonify({"error": f"Invalid start_date format: {start_date_str}"}), 400

            if end_date_str:
                try:
                    # Add one day to include full end date
                    end_datetime = datetime.strptime(end_date_str, '%Y-%m-%d') + timedelta(days=1)
                except Exception as e:
                    logger.error(f"Error parsing end date '{end_date_str}': {e}")
                    return jsonify({"error": f"Invalid end_date format: {end_date_str}"}), 400

            # Add date range to query
            time_filter = {}
            if start_datetime:
                time_filter["$gte"] = start_datetime
            if end_datetime:
                time_filter["$lt"] = end_datetime

            if time_filter:
                query[filter_by] = time_filter

        # Get total count for pagination
        total_meals = mongo.db.meals_only.count_documents(query)

        # Execute the query with pagination
        meals = list(mongo.db.meals_only.find(query).sort("timestamp", -1).skip(skip).limit(limit))

        # Format results
        formatted_meals = []
        for meal in meals:
            formatted_meal = {
                "id": str(meal["_id"]),
                "timestamp": meal["timestamp"].isoformat(),
                "mealType": meal.get("mealType", "normal"),
                "foodItems": meal.get("foodItems", []),
                "nutrition": meal.get("nutrition", {}),
                "notes": meal.get("notes", ""),
                "calculation_summary": meal.get("calculation_summary", {})
            }

            formatted_meals.append(formatted_meal)

        return jsonify({
            "meals": formatted_meals,
            "pagination": {
                "total": total_meals,
                "limit": limit,
                "skip": skip
            }
        }), 200

    except Exception as e:
        logger.error(f"Error retrieving patient meals-only data: {str(e)}")
        return jsonify({"error": str(e)}), 500
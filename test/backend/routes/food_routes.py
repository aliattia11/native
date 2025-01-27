from flask import Blueprint, request, jsonify, current_app
from services.food_service import get_food_details, search_food
from utils.auth import token_required
from config import mongo
from datetime import datetime
from constants import Constants
from models.food_data import (
    FOOD_DATABASE, STARCH_LIST, STARCHY_VEGETABLES, PULSES,
    FRUITS, MILK_AND_DAIRY, SWEETS_AND_DESSERTS, SNACKS,
    COMMON_SNACKS, HIGH_PROTEIN_FOODS, HIGH_FAT_FOODS,
    INDIAN_DISHES, CHINESE_DISHES, ITALIAN_DISHES
)

food_routes = Blueprint('food_routes', __name__)


@food_routes.route('/api/food/categories', methods=['GET'])
@token_required
def get_categories(current_user):
    try:
        # Create an instance of Constants class with user ID
        constants = Constants(str(current_user['_id']))

        # Get measurements and standard portions from constants
        measurements_data = constants.get_supported_measurements()

        response = {
            'measurements': {
                'volume': measurements_data['volume'],
                'weight': measurements_data['weight']
            },
            'standard_portions': measurements_data['standard_portions'],
            'categories': {
                'basic': list(FOOD_DATABASE.keys()),
                'starch': list(STARCH_LIST.keys()),
                'starchy_vegetables': list(STARCHY_VEGETABLES.keys()),
                'pulses': list(PULSES.keys()),
                'fruits': list(FRUITS.keys()),
                'dairy': list(MILK_AND_DAIRY.keys()),
                'sweets': list(SWEETS_AND_DESSERTS.keys()),
                'snacks': list(SNACKS.keys()),
                'common_snacks': list(COMMON_SNACKS.keys()),
                'high_protein': list(HIGH_PROTEIN_FOODS.keys()),
                'high_fat': list(HIGH_FAT_FOODS.keys()),
                'indian': list(INDIAN_DISHES.keys()),
                'chinese': list(CHINESE_DISHES.keys()),
                'italian': list(ITALIAN_DISHES.keys()),
                'custom': []  # Will be populated from database
            }
        }

        # Add custom foods if available
        try:
            custom_foods = list(mongo.db.custom_foods.find(
                {'user_id': str(current_user['_id'])},
                {'name': 1, '_id': 0}
            ))
            response['categories']['custom'] = [food['name'] for food in custom_foods]
        except Exception as e:
            print(f"Error fetching custom foods: {str(e)}")
            # Continue without custom foods rather than failing the whole request

        return jsonify(response), 200

    except Exception as e:
        print(f"Error in get_categories: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@food_routes.route('/api/food/search', methods=['GET'])
@token_required
def search_food_api(current_user):
    query = request.args.get('q', '').lower()
    category = request.args.get('category', None)

    # Get food results including custom foods
    results = search_food(query, category)

    # Add user_id filter for custom foods
    if 'custom' in [r['category'] for r in results]:
        results = [r for r in results if (
                r['category'] != 'custom' or
                mongo.db.custom_foods.find_one({
                    'name': r['name'],
                    'user_id': str(current_user['_id'])
                })
        )]

    return jsonify(results)

@food_routes.route('/api/food/custom', methods=['POST'])
@token_required
def add_custom_food(current_user):
    custom_foods = mongo.db.custom_foods
    data = request.json

    required_fields = ['name', 'serving_size', 'carbs', 'protein', 'fat']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    food_data = {
        'user_id': str(current_user['_id']),
        'name': data['name'],
        'serving_size': {
            'amount': float(data['serving_size']['amount']),
            'unit': data['serving_size']['unit'],
            'w_amount': float(data['serving_size'].get('w_amount', data['serving_size']['amount'])),
            'w_unit': data['serving_size'].get('w_unit', data['serving_size']['unit'])
        },
        'carbs': float(data['carbs']),
        'protein': float(data['protein']),
        'fat': float(data['fat']),
        'description': data.get('description', ''),
        'absorption_type': data.get('absorption_type', 'medium'),
        'created_at': datetime.utcnow()
    }

    result = custom_foods.insert_one(food_data)
    return jsonify({'message': 'Custom food added successfully', 'id': str(result.inserted_id)}), 201



@food_routes.route('/api/food/custom', methods=['GET'])
@token_required
def get_custom_foods(current_user):
    custom_foods = list(mongo.db.custom_foods.find({'user_id': str(current_user['_id'])}))
    return jsonify([{
        'id': str(food['_id']),
        'name': food['name'],
        'serving_size': food['serving_size'],
        'carbs': food['carbs'],
        'protein': food['protein'],
        'fat': food['fat'],
        'description': food.get('description', ''),
        'absorption_type': food.get('absorption_type', 'unknown')
    } for food in custom_foods])



@food_routes.route('/api/food/favorite', methods=['POST'])
@token_required
def add_favorite_food(current_user):
    data = request.json
    food_name = data.get('food_name')

    if not food_name:
        return jsonify({'error': 'Food name is required'}), 400

    result = mongo.db.favorite_foods.update_one(
        {'user_id': str(current_user['_id']), 'food_name': food_name},
        {'$set': {'food_name': food_name}},
        upsert=True
    )

    return jsonify({'message': 'Food added to favorites'}), 200


@food_routes.route('/api/food/favorite', methods=['GET'])
@token_required
def get_favorite_foods(current_user):
    favorites = list(mongo.db.favorite_foods.find({'user_id': str(current_user['_id'])}))
    favorite_foods = []

    for fav in favorites:
        food_details = get_food_details(fav['food_name'])
        if food_details:
            favorite_foods.append({
                'name': fav['food_name'],
                'details': food_details['details'],
                'category': food_details['category']
            })

    return jsonify(favorite_foods)


@food_routes.route('/api/food/measurements', methods=['GET'])
@token_required
def get_measurements(current_user):
    """
    Get all supported measurement types and standard portions
    """
    try:
        # Use the app's constants instance
        measurements = current_app.constants.get_supported_measurements()

        response = {
            "volume": measurements["volume"],
            "weight": measurements["weight"],
            "standard_portions": measurements["standard_portions"]
        }

        return jsonify(response), 200

    except Exception as e:
        print(f"Error in get_measurements: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@food_routes.route('/api/food/nutritional-summary', methods=['POST'])
@token_required
def get_nutritional_summary(current_user):
    data = request.json
    meal_items = data.get('meal_items', [])

    if not meal_items:
        return jsonify({'error': 'No meal items provided'}), 400

    # Initialize Constants with patient_id for patient-specific settings
    patient_constants = Constants(str(current_user['_id']))
    total_carbs = 0
    total_protein = 0
    total_fat = 0

    for item in meal_items:
        if not all(k in item for k in ['name', 'portion', 'measurement']):
            return jsonify({'error': f'Invalid meal item format: {item}'}), 400

        food_details = get_food_details(item['name'])
        if not food_details:
            continue

        # Convert portions using new Constants methods
        converted_amount = patient_constants.convert_to_standard(
            item['portion'],
            item['measurement']
        )

        if converted_amount is not None:
            # Calculate nutrients based on converted amount
            ratio = converted_amount / food_details['serving_size']['amount']
            total_carbs += food_details['carbs'] * ratio
            total_protein += food_details['protein'] * ratio
            total_fat += food_details['fat'] * ratio

    return jsonify({
        'total_carbs': round(total_carbs, 1),
        'total_protein': round(total_protein, 1),
        'total_fat': round(total_fat, 1),
        'total_calories': round((total_carbs * 4) + (total_protein * 4) + (total_fat * 9), 1)
    })
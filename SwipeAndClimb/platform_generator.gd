extends Node2D

## Root gameplay controller: procedural generation, obstacle spawns, scoring, and event flow.

@export var floor_spacing: float = 96.0
@export var horizontal_range: float = 220.0
@export var floors_ahead: int = 12
@export var lightbulb_score: int = 10
@export var start_height: float = 200.0

var random := RandomNumberGenerator.new()
var highest_floor_generated: int = -1
var difficulty_level: int = 0
var is_game_over: bool = false
var email_gate_triggered: bool = false

var tips: Array = []
var last_reported_floor: int = -1
onready var player: CharacterBody2D = $Player
onready var platforms_root: Node2D = $"Platforms"
onready var ladders_root: Node2D = $"Ladders"
onready var collectibles_root: Node2D = $"Collectibles"
onready var obstacles_root: Node2D = $"Obstacles"
onready var obstacle_timer: Timer = $ObstacleSpawnTimer
onready var difficulty_timer: Timer = $DifficultyTimer
onready var ui: Node = $UI
onready var background_rect: ColorRect = $Background/Layer/Sky

const LIGHTBULB_TEXTURE := "res://assets/sprites/lightbulb.png"
const PLATFORM_TEXTURE := "res://assets/sprites/platform.png"
const LADDER_TEXTURE := "res://assets/sprites/ladder.png"
const MUSIC_STREAM := "res://assets/sounds/bg_loop.ogg"

class LightbulbPickup:
    extends Area2D

    var score_value: int = 10

    func _ready() -> void:
        monitoring = true
        collision_layer = 0
        collision_mask = 1
        body_entered.connect(_on_body_entered)

    func _on_body_entered(body: Node) -> void:
        if body is CharacterBody2D and body.has_method("add_score"):
            body.add_score(score_value)
            queue_free()
            var sfx_parent := get_tree().get_root().find_node("SFX", true, false)
            if sfx_parent:
                var pickup: AudioStreamPlayer = sfx_parent.get_node_or_null("Pickup")
                if pickup:
                    pickup.play()

func _ready() -> void:
    random.randomize()
    _setup_music()
    _load_tips()
    _connect_player_signals()
    _generate_initial_floors()
    ui.call("update_score", 0, 0)

func _setup_music() -> void:
    var music: AudioStreamPlayer = $Music
    if MUSIC_STREAM != "":
        var stream := preload_if_exists(MUSIC_STREAM)
        if stream:
            music.stream = stream
            music.play()

func preload_if_exists(path: String):
    if ResourceLoader.exists(path):
        return ResourceLoader.load(path)
    return null

func _load_tips() -> void:
    var tips_path := "res://data/tips.json"
    if ResourceLoader.exists(tips_path):
        var file := FileAccess.open(tips_path, FileAccess.READ)
        if file:
            var parsed := JSON.parse_string(file.get_as_text())
            if parsed is Array:
                tips = parsed

func _connect_player_signals() -> void:
    player.hit_obstacle.connect(_on_player_hit)
    player.collected_lightbulb.connect(_on_lightbulb_collected)
    player.landed_on_floor.connect(_on_player_landed)

func _generate_initial_floors() -> void:
    for i in range(floors_ahead):
        _spawn_floor(i)
    highest_floor_generated = floors_ahead - 1

func _physics_process(_delta: float) -> void:
    if is_game_over:
        return

    var raw_floor := (start_height - player.global_position.y) / floor_spacing
    var player_floor := max(0, floori(raw_floor))

    if player_floor + floors_ahead > highest_floor_generated:
        for floor in range(highest_floor_generated + 1, player_floor + floors_ahead + 1):
            _spawn_floor(floor)
        highest_floor_generated = player_floor + floors_ahead

    if player_floor != last_reported_floor:
        last_reported_floor = player_floor
        player.on_new_floor(player_floor)

func _spawn_floor(floor_number: int) -> void:
    var platform := StaticBody2D.new()
    platform.name = "Platform_%d" % floor_number

    var collider := CollisionShape2D.new()
    collider.shape = RectangleShape2D.new()
    collider.shape.extents = Vector2(80, 8)
    platform.add_child(collider)

    var sprite := Sprite2D.new()
    sprite.texture = preload_if_exists(PLATFORM_TEXTURE)
    sprite.modulate = Color(1, 1, 1, 1)
    sprite.scale = Vector2(1.6, 1)
    platform.add_child(sprite)

    var x_offset := random.randf_range(-horizontal_range, horizontal_range)
    platform.position = Vector2(x_offset, start_height - floor_number * floor_spacing)

    platforms_root.add_child(platform)

    var ladder := Area2D.new()
    ladder.name = "Ladder_%d" % floor_number
    ladder.add_to_group("ladder")
    ladder.collision_layer = 2
    ladder.collision_mask = 0

    var ladder_shape := CollisionShape2D.new()
    ladder_shape.shape = RectangleShape2D.new()
    ladder_shape.shape.extents = Vector2(16, floor_spacing * 0.5)
    ladder.add_child(ladder_shape)

    var ladder_sprite := Sprite2D.new()
    ladder_sprite.texture = preload_if_exists(LADDER_TEXTURE)
    ladder_sprite.scale = Vector2(0.5, 1.2)
    ladder.add_child(ladder_sprite)

    ladder.position = platform.position + Vector2(random.randf_range(-40, 40), -floor_spacing * 0.5)
    ladders_root.add_child(ladder)

    if floor_number % 2 == 0 and floor_number > 0:
        _spawn_lightbulb(platform.position + Vector2(random.randf_range(-40, 40), -32))

func _spawn_lightbulb(position: Vector2) -> void:
    var bulb := LightbulbPickup.new()
    bulb.score_value = lightbulb_score

    var shape := CollisionShape2D.new()
    shape.shape = CircleShape2D.new()
    shape.shape.radius = 12
    bulb.add_child(shape)

    var sprite := Sprite2D.new()
    sprite.texture = preload_if_exists(LIGHTBULB_TEXTURE)
    sprite.modulate = Color(1.2, 1.2, 0.4)
    bulb.add_child(sprite)

    bulb.position = position
    collectibles_root.add_child(bulb)

func _on_obstacle_spawn() -> void:
    if is_game_over or ui.call("is_modal_open"):
        return

    var obstacle := Area2D.new()
    obstacle.set_script(load("res://obstacle.gd"))
    obstacle.collision_layer = 0
    obstacle.collision_mask = 1

    var collision := CollisionShape2D.new()
    collision.shape = CircleShape2D.new()
    collision.shape.radius = 18
    obstacle.add_child(collision)

    var sprite := Sprite2D.new()
    sprite.texture = preload_if_exists("res://assets/sprites/obstacle.png")
    sprite.modulate = Color(1, 0.6, 0.2)
    obstacle.add_child(sprite)

    var direction := random.randf() > 0.5 ? 1 : -1
    obstacle.global_position = Vector2(direction * horizontal_range, player.global_position.y - 320)

    obstacles_root.add_child(obstacle)
    obstacle.call("launch", direction, difficulty_level)

func _on_difficulty_timeout() -> void:
    difficulty_level += 1
    obstacle_timer.wait_time = max(1.2, obstacle_timer.wait_time * 0.92)

func _on_player_hit() -> void:
    if is_game_over:
        return
    is_game_over = true
    obstacle_timer.stop()
    difficulty_timer.stop()
    ui.call("show_game_over", player.score)
    _play_sfx("Hit")

func _on_lightbulb_collected(value: int) -> void:
    ui.call("update_score", player.current_floor, player.score)

func _on_player_landed(floor_number: int) -> void:
    if is_game_over:
        return
    ui.call("update_score", floor_number, player.score)
    _check_for_tip(floor_number)
    _check_background_shift(floor_number)
    _check_email_gate(floor_number)

func _check_for_tip(floor_number: int) -> void:
    for tip in tips:
        if tip.get("floor", -1) == floor_number and not ui.call("is_modal_open"):
            ui.call("show_tip", tip.get("text", ""))
            break

func _check_background_shift(floor_number: int) -> void:
    if floor_number % 10 == 0:
        var hue_shift := float((floor_number / 10) % 12) / 12.0
        var new_color := Color.from_hsv(hue_shift, 0.6, 0.4)
        background_rect.color = new_color

func _check_email_gate(floor_number: int) -> void:
    if floor_number >= 30 and not email_gate_triggered:
        email_gate_triggered = true
        obstacle_timer.stop()
        difficulty_timer.stop()
        ui.call("show_email_gate")

func pause_for_modal() -> void:
    obstacle_timer.stop()
    difficulty_timer.stop()
    set_physics_process(false)
    player.set_physics_process(false)
    player.set_process(false)
    for obstacle in obstacles_root.get_children():
        obstacle.set_physics_process(false)

func resume_after_modal() -> void:
    if is_game_over:
        return
    set_physics_process(true)
    player.set_physics_process(true)
    player.set_process(true)
    for obstacle in obstacles_root.get_children():
        obstacle.set_physics_process(true)
    obstacle_timer.start()
    difficulty_timer.start()

func reset_game() -> void:
    for child in platforms_root.get_children():
        child.queue_free()
    for child in ladders_root.get_children():
        child.queue_free()
    for child in collectibles_root.get_children():
        child.queue_free()
    for child in obstacles_root.get_children():
        child.queue_free()

    highest_floor_generated = -1
    difficulty_level = 0
    is_game_over = false
    email_gate_triggered = false
    last_reported_floor = -1
    set_physics_process(true)
    player.set_physics_process(true)
    player.set_process(true)
    obstacle_timer.wait_time = 4.0
    obstacle_timer.start()
    difficulty_timer.start()

    player.reset(Vector2(0, start_height))
    _generate_initial_floors()
    ui.call("update_score", 0, 0)

func show_affiliate_ad() -> void:
    ## Placeholder to integrate a cross-promotion banner or interstitial later.
    print("[Funnel] Showing affiliate ad placeholder")

func _play_sfx(node_name: String) -> void:
    var sfx_parent := get_tree().get_root().find_node("SFX", true, false)
    if sfx_parent:
        var sfx: AudioStreamPlayer = sfx_parent.get_node_or_null(node_name)
        if sfx:
            sfx.play()

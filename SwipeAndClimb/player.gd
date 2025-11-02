extends CharacterBody2D

## Player movement script for Swipe & Climb – Retro Run.
## Handles swipe-style inputs mapped to Godot actions and ladder climbing.

@export var move_speed: float = 150.0
@export var air_control: float = 0.6
@export var jump_velocity: float = -360.0
@export var gravity: float = 900.0
@export var ladder_speed: float = 120.0

var can_climb: bool = false
var is_climbing: bool = false
var current_floor: int = 0
var score: int = 0

var ladder_overlaps: Array = []
var was_on_floor: bool = false

onready var sprite: AnimatedSprite2D = $Sprite
onready var ladder_detector: Area2D = $LadderDetector
onready var camera: Camera2D = $Camera2D

signal hit_obstacle
signal collected_lightbulb(value: int)
signal landed_on_floor(floor_number: int)

func _ready() -> void:
    ## Listen for ladder overlaps so the climb action can be toggled.
    ladder_detector.area_entered.connect(_on_ladder_entered)
    ladder_detector.area_exited.connect(_on_ladder_exited)

func _physics_process(delta: float) -> void:
    if is_climbing:
        _process_climb(delta)
        return

    var input_dir := Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
    var desired_vel := input_dir * move_speed

    if not is_on_floor():
        velocity.x = lerp(velocity.x, desired_vel, air_control)
        velocity.y += gravity * delta
    else:
        velocity.x = desired_vel
        velocity.y = 0.0
        if Input.is_action_just_pressed("jump"):
            velocity.y = jump_velocity
            _play_sfx("Jump")
    if can_climb and Input.is_action_pressed("climb"):
        is_climbing = true
        velocity = Vector2.ZERO
        sprite.play("climb")
        return

    var grounded_before := was_on_floor
    move_and_slide()
    was_on_floor = is_on_floor()
    if was_on_floor and not grounded_before:
        _play_sfx("Chime")

    if was_on_floor and velocity.y == 0.0:
        sprite.play("idle")

func _process_climb(delta: float) -> void:
    var climb_dir := 0.0
    if Input.is_action_pressed("climb"):
        climb_dir = -1.0
    elif Input.is_action_pressed("move_down"):
        climb_dir = 1.0
    else:
        climb_dir = 0.0

    position.y += climb_dir * ladder_speed * delta
    velocity = Vector2.ZERO

    if not Input.is_action_pressed("climb") and not Input.is_action_pressed("move_down"):
        sprite.play("climb_idle")
    else:
        sprite.play("climb")

    if not can_climb:
        is_climbing = false
    was_on_floor = false

func _on_ladder_entered(area: Area2D) -> void:
    if area.is_in_group("ladder"):
        can_climb = true
        ladder_overlaps.append(area)

func _on_ladder_exited(area: Area2D) -> void:
    if area.is_in_group("ladder"):
        ladder_overlaps.erase(area)
        if ladder_overlaps.is_empty():
            can_climb = false
            is_climbing = false

func take_hit() -> void:
    emit_signal("hit_obstacle")

func add_score(value: int) -> void:
    score += value
    emit_signal("collected_lightbulb", value)

func on_new_floor(floor_number: int) -> void:
    current_floor = floor_number
    emit_signal("landed_on_floor", floor_number)
    score = max(score, floor_number * 5)

func reset(start_position: Vector2) -> void:
    global_position = start_position
    velocity = Vector2.ZERO
    can_climb = false
    is_climbing = false
    ladder_overlaps.clear()
    current_floor = 0
    score = 0
    was_on_floor = false
    sprite.play("idle")

func _play_sfx(node_name: String) -> void:
    var sfx_parent := get_tree().get_root().find_node("SFX", true, false)
    if sfx_parent:
        var sfx: AudioStreamPlayer = sfx_parent.get_node_or_null(node_name)
        if sfx:
            sfx.play()

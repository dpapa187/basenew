extends Area2D

## Rolling obstacle that sweeps diagonally down the level.
## The script handles movement, collision with the player, and cleanup when off-screen.

@export var base_speed: float = 90.0
@export var horizontal_drift: float = 60.0
@export var gravity: float = 120.0

var velocity: Vector2 = Vector2.ZERO
var direction: int = -1

func _ready() -> void:
    body_entered.connect(_on_body_entered)
    set_physics_process(true)

func launch(direction_multiplier: int, difficulty: float) -> void:
    direction = direction_multiplier
    velocity.x = horizontal_drift * float(direction)
    velocity.y = base_speed + difficulty * 12.0

func _physics_process(delta: float) -> void:
    velocity.y += gravity * delta
    position += velocity * delta

    if global_position.y > get_viewport_rect().size.y + 200.0:
        queue_free()

func _on_body_entered(body: Node) -> void:
    if body is CharacterBody2D and body.has_method("take_hit"):
        body.take_hit()
        _play_sfx("Hit")
        queue_free()

func _play_sfx(node_name: String) -> void:
    var sfx_parent := get_tree().get_root().find_node("SFX", true, false)
    if sfx_parent:
        var sfx: AudioStreamPlayer = sfx_parent.get_node_or_null(node_name)
        if sfx:
            sfx.play()
